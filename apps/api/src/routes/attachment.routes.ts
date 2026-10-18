import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Attachment, Trade } from '../db/models/index.js';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import { validateObjectIdParam } from '../middleware/validate.js';

/**
 * Validates file signature (magic bytes) to protect against disguised binary payloads
 */
function verifyImageMagicBytes(filePath: string, mimeType: string): boolean {
  try {
    const buffer = Buffer.alloc(12);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, 12, 0);
    fs.closeSync(fd);

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

    // Validate MIME type
    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowedMimeTypes.includes(data.mimetype)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_FILE_TYPE', message: 'Only PNG, JPEG, and WebP images are permitted' },
      });
    }

    // Server-controlled random UUID filename prevents path traversal
    const ext = path.extname(data.filename).toLowerCase() || (data.mimetype === 'image/jpeg' ? '.jpg' : '.png');
    const safeFilename = `${crypto.randomUUID()}${ext}`;
    const targetFilePath = path.join(config.uploadDir, safeFilename);

    // Stream file to disk
    await pipeline(data.file, fs.createWriteStream(targetFilePath));

    const stat = fs.statSync(targetFilePath);

    // Validate file magic bytes signature
    const isValidSignature = verifyImageMagicBytes(targetFilePath, data.mimetype);
    if (!isValidSignature) {
      try {
        fs.unlinkSync(targetFilePath);
      } catch {
        // ignore
      }
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_IMAGE_SIGNATURE', message: 'Uploaded file signature does not match image header' },
      });
    }

    // Extract form metadata from multipart fields
    const rawCategory = (data.fields.category as any)?.value;
    const category = ['SETUP', 'ENTRY', 'EXIT', 'REVIEW', 'OTHER', 'BEFORE_ENTRY', 'ANNOTATED', 'ATTACHMENT'].includes(rawCategory)
      ? rawCategory
      : 'ENTRY';
    const description = (data.fields.caption as any)?.value || (data.fields.description as any)?.value || '';
    const timeframe = (data.fields.timeframe as any)?.value || '';
    const chartTimestamp = (data.fields.chartTimestamp as any)?.value || '';

    // Save attachment record in MongoDB
    const attachment = await Attachment.create({
      userId: req.user!.id,
      tradeId: trade._id,
      originalName: path.basename(data.filename),
      storedFilename: safeFilename,
      mimeType: data.mimetype,
      sizeBytes: stat.size,
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

  // Authenticated stream download of private screenshot
  app.get('/:id/download', { preHandler: [validateObjectIdParam('id')] }, async (req: any, reply) => {
    const attachment = await Attachment.findOne({ _id: req.params.id, userId: req.user!.id });
    if (!attachment) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Attachment not found or unauthorized' },
      });
    }

    const filePath = path.join(config.uploadDir, attachment.storedFilename);
    if (!fs.existsSync(filePath)) {
      return reply.status(404).send({
        success: false,
        error: { code: 'FILE_NOT_FOUND', message: 'File missing from private storage' },
      });
    }

    reply.header('Content-Type', attachment.mimeType);
    reply.header('Content-Disposition', `inline; filename="${encodeURIComponent(attachment.originalName)}"`);
    reply.header('Cache-Control', 'private, max-age=86400');
    return reply.send(fs.createReadStream(filePath));
  });

  // Delete attachment
  app.delete('/:id', { preHandler: [validateObjectIdParam('id')] }, async (req: any, reply) => {
    const attachment = await Attachment.findOne({ _id: req.params.id, userId: req.user!.id });
    if (!attachment) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Attachment not found or unauthorized' },
      });
    }

    // Safely unlink from disk
    const filePath = path.join(config.uploadDir, attachment.storedFilename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err: any) {
        req.log.warn('Failed to delete file from disk: %s', err.message);
      }
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
