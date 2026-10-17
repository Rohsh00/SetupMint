import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Attachment, Trade } from '../db/models/index.js';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';

export const attachmentRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

  // Upload attachment for a trade
  app.post('/trades/:tradeId/upload', async (req: any, reply) => {
    const trade = await Trade.findOne({ _id: req.params.tradeId, userId: req.user!.id });
    if (!trade) {
      return reply.status(404).send({
        success: false,
        error: { code: 'TRADE_NOT_FOUND', message: 'Trade not found' },
      });
    }

    const data = await req.file();
    if (!data) {
      return reply.status(400).send({
        success: false,
        error: { code: 'NO_FILE', message: 'No file uploaded' },
      });
    }

    // Validate mime type
    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowedMimeTypes.includes(data.mimetype)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_FILE_TYPE', message: 'Only PNG, JPEG, and WebP images are allowed' },
      });
    }

    // Generate safe unique filename
    const ext = path.extname(data.filename) || '.png';
    const safeFilename = `${crypto.randomUUID()}${ext}`;
    const targetFilePath = path.join(config.uploadDir, safeFilename);

    // Stream to private local disk
    await pipeline(data.file, fs.createWriteStream(targetFilePath));

    const stat = fs.statSync(targetFilePath);

    // Save attachment metadata
    const attachment = await Attachment.create({
      userId: req.user!.id,
      tradeId: trade._id,
      originalName: data.filename,
      storedFilename: safeFilename,
      mimeType: data.mimetype,
      sizeBytes: stat.size,
      category: 'ENTRY',
    });

    // Link to trade
    trade.screenshotIds.push(attachment._id as any);
    await trade.save();

    return reply.status(201).send({
      success: true,
      data: {
        id: attachment._id.toString(),
        originalName: attachment.originalName,
        category: attachment.category,
        sizeBytes: attachment.sizeBytes,
        uploadedAt: attachment.createdAt.toISOString(),
      },
    });
  });

  // Authenticated stream download of private screenshot
  app.get('/:id/download', async (req: any, reply) => {
    const attachment = await Attachment.findOne({ _id: req.params.id, userId: req.user!.id });
    if (!attachment) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Attachment not found' },
      });
    }

    const filePath = path.join(config.uploadDir, attachment.storedFilename);
    if (!fs.existsSync(filePath)) {
      return reply.status(404).send({
        success: false,
        error: { code: 'FILE_NOT_FOUND', message: 'File missing from storage' },
      });
    }

    reply.header('Content-Type', attachment.mimeType);
    reply.header('Content-Disposition', `inline; filename="${attachment.originalName}"`);
    return reply.send(fs.createReadStream(filePath));
  });

  // Delete attachment
  app.delete('/:id', async (req: any, reply) => {
    const attachment = await Attachment.findOne({ _id: req.params.id, userId: req.user!.id });
    if (!attachment) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Attachment not found' },
      });
    }

    const filePath = path.join(config.uploadDir, attachment.storedFilename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err: any) {
        console.warn('Failed to delete file from disk:', err.message);
      }
    }

    if (attachment.tradeId) {
      await Trade.findByIdAndUpdate(attachment.tradeId, {
        $pull: { screenshotIds: attachment._id },
      });
    }

    await Attachment.deleteOne({ _id: req.params.id });
    return reply.send({ success: true, message: 'Attachment deleted successfully' });
  });
};
