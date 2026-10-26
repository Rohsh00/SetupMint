import mongoose, { Document, Schema } from 'mongoose';

export interface IHolidayCalendarDoc extends Document {
  exchange: 'NSE' | 'BSE' | 'MCX' | string;
  segment?: 'EQUITY' | 'FO' | 'COMMODITY' | 'CURRENCY' | 'ALL';
  date: string; // YYYY-MM-DD
  year: number;
  description: string;
  isTradingHoliday: boolean;
  morningSessionClosed: boolean;
  eveningSessionClosed: boolean;
  isSpecialTrading: boolean; // e.g. Diwali Muhurat Trading
  specialTradingHours?: {
    openTime: string;  // HH:mm
    closeTime: string; // HH:mm
  };
  source: 'OFFICIAL_CIRCULAR' | 'UPSTOX_API' | 'NSE_API' | 'MANUAL';
  createdAt: Date;
  updatedAt: Date;
}

const HolidayCalendarSchema = new Schema<IHolidayCalendarDoc>(
  {
    exchange: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      default: 'NSE',
      index: true,
    },
    segment: {
      type: String,
      uppercase: true,
      trim: true,
      default: 'ALL',
    },
    date: {
      type: String,
      required: true,
      trim: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      index: true,
    },
    year: {
      type: Number,
      required: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    isTradingHoliday: {
      type: Boolean,
      default: true,
    },
    morningSessionClosed: {
      type: Boolean,
      default: true,
    },
    eveningSessionClosed: {
      type: Boolean,
      default: true,
    },
    isSpecialTrading: {
      type: Boolean,
      default: false,
    },
    specialTradingHours: {
      openTime: { type: String, default: null },
      closeTime: { type: String, default: null },
    },
    source: {
      type: String,
      enum: ['OFFICIAL_CIRCULAR', 'UPSTOX_API', 'NSE_API', 'MANUAL'],
      default: 'OFFICIAL_CIRCULAR',
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index ensuring no duplicate entries per date and exchange
HolidayCalendarSchema.index({ exchange: 1, date: 1, segment: 1 }, { unique: true });
HolidayCalendarSchema.index({ exchange: 1, year: 1 });

export const HolidayCalendar = mongoose.model<IHolidayCalendarDoc>(
  'HolidayCalendar',
  HolidayCalendarSchema
);
