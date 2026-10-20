import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import path from 'path';
import { Attachment, Trade } from '../db/models/index.js';
import { getStorage, optimizeImage } from '../storage/index.js';
import { requireAuth } from '../middleware/auth.js';
import { validateObjectIdParam } from '../middleware/validate.js';
import { config } from '../config.js';

/**
 * Validates file signature (magic bytes) directly against the in-memory buffer
 * to protect against disguised binary payloads before sending anything to cloud storage.
 */
function verifyImageMagicBytes(buffer: Buffer, mimeType: string): boolean {
  try {
    if (!buffer || buffer.length < 12) {
      return false;
    }

    if (mimeType === 'image/png') {
      return (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a
      );
    }
    if (mimeType === 'image/jpeg') {
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }
    if (mimeType === 'image/webp') {
      const isRiff = buffer.toString('ascii', 0, 4) === 'RIFF';
      const isWebp = buffer.toString('ascii', 8, 12) === 'WEBP';
      return isRiff && isWebp;
    }
    return false;
  } catch {
    return false;
  }
}

export const attachmentRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

  // Upload attachment for a trade
  app.post('/trades/:tradeId/upload', { preHandler: [validateObjectIdParam('tradeId')] }, async (req: any, reply) => {
    const trade = await Trade.findOne({ _id: req.params.tradeId, userId: req.user!.id });
    if (!trade) {
      return reply.status(404).send({
        success: false,
        error: { code: 'TRADE_NOT_FOUND', message: 'Trade not found or unauthorized' },
      });
    }

    // Limit check: maximum 12 screenshots per trade
    if (trade.screenshotIds && trade.screenshotIds.length >= 12) {
      return reply.status(400).send({
        success: false,
        error: { code: 'ATTACHMENT_LIMIT_EXCEEDED', message: 'Maximum 12 chart screenshots allowed per trade' },
      });
    }

    const data = await req.file();
    if (!data) {
      return reply.status(400).send({
        success: false,
        error: { code: 'NO_FILE', message: 'No image file uploaded' },
      });
    }

    // Validate MIME type against strict allow-list
    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowedMimeTypes.includes(data.mimetype)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_FILE_TYPE', message: 'Only PNG, JPEG, and WebP images are permitted' },
      });
    }

    // Buffer the file directly into memory for signature inspection
    const fileBuffer = await data.toBuffer();

    // Enforce MAX_FILE_SIZE_MB on the INPUT buffer before optimization
    const maxBytes = config.maxFileSizeMb * 1024 * 1024;
    if (fileBuffer.length > maxBytes) {
      return reply.status(400).send({
        success: false,
        error: { code: 'FILE_TOO_LARGE', message: `File exceeds maximum allowed size of ${config.maxFileSizeMb} MB` },
      });
    }

    // Validate file magic bytes signature BEFORE optimizing or saving to Cloudflare R2
    const isValidSignature = verifyImageMagicBytes(fileBuffer, data.mimetype);
    if (!isValidSignature) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_IMAGE_SIGNATURE', message: 'Uploaded file signature does not match image header' },
      });
    }

    // Run server-side image optimization pipeline
    const rawExt = path.extname(data.filename).toLowerCase();
    const fallbackExt = rawExt || (data.mimetype === 'image/jpeg' ? '.jpg' : '.png');
    const optimized = await optimizeImage(fileBuffer, data.mimetype, fallbackExt);

    req.log.info(
      {
        originalBytes: optimized.originalBytes,
        optimizedBytes: optimized.optimizedBytes,
        wasOptimized: optimized.wasOptimized,
        originalMime: data.mimetype,
        storedMime: optimized.mimeType,
      },
      'Chart screenshot processed by optimization pipeline'
    );

    // Server-controlled random UUID filename with optimized extension
    const safeFilename = `${crypto.randomUUID()}.${optimized.ext.replace(/^\./, '')}`;

    const storage = getStorage();

    // Save directly to cloud storage (Cloudflare R2 / S3)
    await storage.save(safeFilename, optimized.buffer, optimized.mimeType);

    // Extract form metadata from multipart fields
    const rawCategory = (data.fields.category as any)?.value;
    const category = ['SETUP', 'ENTRY', 'EXIT', 'REVIEW', 'OTHER', 'BEFORE_ENTRY', 'ANNOTATED', 'ATTACHMENT'].includes(rawCategory)
      ? rawCategory
      : 'ENTRY';
    const description = (data.fields.caption as any)?.value || (data.fields.description as any)?.value || '';
    const timeframe = (data.fields.timeframe as any)?.value || '';
    const chartTimestamp = (data.fields.chartTimestamp as any)?.value || '';

    try {
      // Save attachment record in MongoDB Atlas
      const attachment = await Attachment.create({
        userId: req.user!.id,
        tradeId: trade._id,
        originalName: path.basename(data.filename),
        storedFilename: safeFilename,
        mimeType: optimized.mimeType,
        sizeBytes: optimized.optimizedBytes,
        category,
        description,
        timeframe,
        chartTimestamp,
      });

      // Link attachment to trade
      trade.screenshotIds.push(attachment._id as any);
      await trade.save();

      return reply.status(201).send({
        success: true,
        data: {
          id: attachment._id.toString(),
          tradeId: trade._id.toString(),
          originalName: attachment.originalName,
          category: attachment.category,
          caption: attachment.description,
          description: attachment.description,
          timeframe: attachment.timeframe,
          chartTimestamp: attachment.chartTimestamp,
          sizeBytes: attachment.sizeBytes,
          mimeType: attachment.mimeType,
          downloadUrl: `/api/v1/attachments/${attachment._id}/download`,
          uploadedAt: attachment.createdAt.toISOString(),
        },
      });
    } catch (dbErr) {
      // Avoid orphan objects in R2 if DB persistence fails
      try {
        await storage.delete(safeFilename);
      } catch {
        // ignore delete failure on rollback
      }
      throw dbErr;
    }
  });

  // Get all attachments for a specific trade
  app.get('/trades/:tradeId', { preHandler: [validateObjectIdParam('tradeId')] }, async (req: any, reply) => {
    const trade = await Trade.findOne({ _id: req.params.tradeId, userId: req.user!.id });
    if (!trade) {
      return reply.status(404).send({
        success: false,
        error: { code: 'TRADE_NOT_FOUND', message: 'Trade not found' },
      });
    }

    const attachments = await Attachment.find({ tradeId: trade._id, userId: req.user!.id }).sort({ createdAt: 1 });
    const formatted = attachments.map((att) => ({
      id: att._id.toString(),
      tradeId: trade._id.toString(),
      originalName: att.originalName,
      category: att.category,
      caption: att.description,
      description: att.description,
      timeframe: att.timeframe,
      chartTimestamp: att.chartTimestamp,
      sizeBytes: att.sizeBytes,
      mimeType: att.mimeType,
      downloadUrl: `/api/v1/attachments/${att._id}/download`,
      uploadedAt: att.createdAt.toISOString(),
    }));

    return reply.send({ success: true, data: formatted });
  });

  // Update attachment metadata (category, caption/description, timeframe)
  app.put('/:id', { preHandler: [validateObjectIdParam('id')] }, async (req: any, reply) => {
    const attachment = await Attachment.findOne({ _id: req.params.id, userId: req.user!.id });
    if (!attachment) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Attachment not found' },
      });
    }

    const { category, caption, description, timeframe, chartTimestamp } = req.body || {};
    if (category) attachment.category = category;
    if (caption !== undefined) attachment.description = caption;
    if (description !== undefined) attachment.description = description;
    if (timeframe !== undefined) attachment.timeframe = timeframe;
    if (chartTimestamp !== undefined) attachment.chartTimestamp = chartTimestamp;

    await attachment.save();

    return reply.send({
      success: true,
      data: {
        id: attachment._id.toString(),
        category: attachment.category,
        caption: attachment.description,
        timeframe: attachment.timeframe,
        chartTimestamp: attachment.chartTimestamp,
      },
    });
  });

  // Authenticated stream / download of private screenshot via Cloudflare R2
  const handleAttachmentStream = async (req: any, reply: any) => {
    const attachment = await Attachment.findOne({ _id: req.params.id, userId: req.user!.id });
    if (!attachment) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Attachment not found or unauthorized' },
      });
    }

    const storage = getStorage();

    try {
      const stream = await storage.read(attachment.storedFilename);
      reply.header('Content-Type', attachment.mimeType);

      // Determine downloaded filename extension to match stored mime format (e.g. .png -> .webp)
      let downloadFilename = attachment.originalName;
      const storedExt = path.extname(attachment.storedFilename).toLowerCase();
      if (storedExt) {
        const parsed = path.parse(attachment.originalName);
        downloadFilename = `${parsed.name}${storedExt}`;
      }

      reply.header('Content-Disposition', `inline; filename="${encodeURIComponent(downloadFilename)}"`);
      reply.header('Cache-Control', 'private, max-age=86400');
      return reply.send(stream);
    } catch (storageErr: any) {
      if (storageErr.code === 'FILE_NOT_FOUND' || storageErr.name === 'NoSuchKey') {
        return reply.status(404).send({
          success: false,
          error: { code: 'FILE_NOT_FOUND', message: 'File missing from cloud storage' },
        });
      }
      throw storageErr;
    }
  };

  app.get('/:id/download', { preHandler: [validateObjectIdParam('id')] }, handleAttachmentStream);
  app.get('/:id/stream', { preHandler: [validateObjectIdParam('id')] }, handleAttachmentStream);

  // Delete attachment: removes from R2, removes from Attachment collection, pulls from Trade.screenshotIds
  app.delete('/:id', { preHandler: [validateObjectIdParam('id')] }, async (req: any, reply) => {
    const attachment = await Attachment.findOne({ _id: req.params.id, userId: req.user!.id });
    if (!attachment) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Attachment not found or unauthorized' },
      });
    }

    // Delete from Cloudflare R2
    const storage = getStorage();
    try {
      await storage.delete(attachment.storedFilename);
    } catch (err: any) {
      req.log.warn('Failed to delete object from cloud storage: %s', err.message);
    }

    // Remove reference from trade
    if (attachment.tradeId) {
      await Trade.findByIdAndUpdate(attachment.tradeId, {
        $pull: { screenshotIds: attachment._id },
      });
    }

    await Attachment.deleteOne({ _id: req.params.id });
    return reply.send({ success: true, message: 'Attachment deleted successfully' });
  });
};
