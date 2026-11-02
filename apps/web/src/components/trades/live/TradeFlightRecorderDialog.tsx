import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import TextField from '@mui/material/TextField';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import { useTheme as useMuiTheme, alpha } from '@mui/material/styles';

// Icons
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded';
import PsychologyRoundedIcon from '@mui/icons-material/PsychologyRounded';
import SpeedRoundedIcon from '@mui/icons-material/SpeedRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';

import { api } from '../../../lib/api.js';
import { toast } from '../../../context/ToastContext.js';
import { formatCurrency } from '../../../lib/utils.js';
import { generatePostTradeReviewSummary } from '@tradevault/financial-engine';

export interface TradeFlightRecorderDialogProps {
  open: boolean;
  onClose: () => void;
  trade: any;
}

export function TradeFlightRecorderDialog({ open, onClose, trade }: TradeFlightRecorderDialogProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';
  const navigate = useNavigate();

  // Extract financial & execution metrics
  const symbol = trade?.symbol || 'UNKNOWN';
  const direction = trade?.direction || 'LONG';
  const isLong = direction === 'LONG';
  const netPnL = Number(trade?.calculated?.netPnL ?? trade?.simpleExecution?.netPnL ?? 0);
  const grossPnL = Number(trade?.calculated?.grossPnL ?? trade?.simpleExecution?.grossPnL ?? netPnL);
  const totalFees = Number(trade?.calculated?.totalFees ?? trade?.simpleExecution?.totalFees ?? Math.max(0, grossPnL - netPnL));
  const realizedR = trade?.calculated?.realizedR ?? null;
  const isProfitable = netPnL >= 0;

  const entryPrice = Number(
    trade?.simpleExecution?.entryPrice ??
    trade?.calculated?.averageEntryPrice ??
    trade?.entryPrice ??
    0
  );
  const exitPrice = Number(
    trade?.simpleExecution?.exitPrice ??
    trade?.calculated?.averageExitPrice ??
    trade?.exitPrice ??
    0
  );
  const quantity = Number(
    trade?.simpleExecution?.quantity ??
    trade?.quantity ??
    1
  );

  // Excursion & Giveback analytics
  const peakMfePnl = Number(trade?.calculated?.liveMfeSummary?.peakFloatingNetPnL ?? trade?.calculated?.excursion?.mfeNetPnL ?? netPnL);
  const peakMfeR = trade?.calculated?.liveMfeSummary?.peakUnrealizedR ?? trade?.calculated?.excursion?.mfeR ?? realizedR;
  const maeR = trade?.calculated?.excursion?.maeR ?? null;

  // Duration computation
  const durationMinutes = useMemo(() => {
    const entryTime = trade?.entryTime || trade?.tradeDate;
    const exitTime = trade?.exitTime || new Date();
    if (!entryTime) return undefined;
    const ms = new Date(exitTime).getTime() - new Date(entryTime).getTime();
    return ms > 0 ? Math.floor(ms / (60 * 1000)) : 0;
  }, [trade?.entryTime, trade?.tradeDate, trade?.exitTime]);

  const durationStr = useMemo(() => {
    if (durationMinutes === undefined) return '—';
    if (durationMinutes <= 0) return '< 1m';
    const hours = Math.floor(durationMinutes / 60);
    const remMins = durationMinutes % 60;
    if (hours > 0) return `${hours}h ${remMins}m`;
    return `${durationMinutes}m`;
  }, [durationMinutes]);

  // Pure Financial Engine Post-Trade Review Evaluation
  const reviewData = useMemo(() => {
    return generatePostTradeReviewSummary({
      netPnL,
      grossPnL,
      realizedR,
      peakMfePnl,
      peakMfeR,
      maeR,
      stopLossMoved: Boolean(trade?.psychology?.stopLossMoved),
      plannedRiskAmount: trade?.risk?.plannedRiskAmount,
      durationMinutes,
      auditLog: trade?.auditLog,
      existingMistakes: trade?.psychology?.mistakes,
    });
  }, [netPnL, grossPnL, realizedR, peakMfePnl, peakMfeR, maeR, trade?.psychology, trade?.risk, durationMinutes, trade?.auditLog]);

  const mfeCaptureEfficiency = reviewData.mfeCaptureEfficiency;

  // Psychology audit state: pre-filled from last in-trade emotional pulse
  const [selectedEmotion, setSelectedEmotion] = useState<string>(
    trade?.psychology?.emotionalState || reviewData.lastPulseEmotion || 'CALM'
  );
  const [selectedDiscipline, setSelectedDiscipline] = useState<string>(
    trade?.psychology?.ruleAdherence === 'BROKE_RULES' ? 'BROKE_RULES' : 'FOLLOWED_PLAN'
  );
  const [selectedMistakes, setSelectedMistakes] = useState<string[]>(
    trade?.psychology?.mistakes || []
  );
  const [auditNotes, setAuditNotes] = useState<string>(trade?.psychology?.reflectionNotes || '');
  const [isSavingAudit, setIsSavingAudit] = useState(false);

  // Execution Quality Grade Algorithm from Engine
  const gradeInfo = useMemo(() => {
    const grade = reviewData.executionGrade;
    const label = reviewData.gradeReason;
    if (grade === 'A+' || grade === 'A') {
      return { grade, label, color: '#10B981', bg: alpha('#10B981', 0.15) };
    }
    if (grade === 'B+' || grade === 'B') {
      return { grade, label, color: '#3B82F6', bg: alpha('#3B82F6', 0.15) };
    }
    if (grade === 'C') {
      return { grade, label, color: '#F59E0B', bg: alpha('#F59E0B', 0.15) };
    }
    return { grade, label, color: '#EF4444', bg: alpha('#EF4444', 0.15) };
  }, [reviewData]);

  // Save post-trade audit
  const handleSaveAudit = async () => {
    if (!trade?._id && !trade?.id) return;
    setIsSavingAudit(true);
    try {
      const tradeId = trade._id || trade.id;
      const combinedMistakes = Array.from(
        new Set([
          ...selectedMistakes,
          ...(selectedDiscipline === 'BROKE_RULES' ? ['BROKE_RULES'] : []),
        ])
      );

      await api.trades.update(tradeId, {
        psychology: {
          ...trade.psychology,
          emotionalState: selectedEmotion,
          ruleAdherence: selectedDiscipline === 'FOLLOWED_PLAN' ? 'FOLLOWED_PLAN' : 'BROKE_RULES',
          reflectionNotes: auditNotes,
          mistakes: combinedMistakes,
        },
      });
      toast.success('🧠 Trade debrief & psychology recorded in journal!');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to record trade debrief');
    } finally {
      setIsSavingAudit(false);
    }
  };

  // Copy Clean ASCII Trade Receipt to Clipboard
  const handleCopyReceipt = () => {
    const dateStr = new Date(trade?.exitTime || Date.now()).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const receiptText =
`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏁 SETUPMINT — TRADE FLIGHT RECORDER RECEIPT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Symbol:       ${symbol} (${direction})
Time:         ${dateStr} IST
Duration:     ${durationStr}
Execution:    ${quantity} Qty @ Entry ₹${entryPrice} ➔ Exit ₹${exitPrice}

FINANCIAL OUTCOME:
Net P&L:      ${isProfitable ? '+' : ''}₹${netPnL.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
Realized R:   ${realizedR !== null ? `${realizedR >= 0 ? '+' : ''}${realizedR} R` : '—'}
Execution:    Grade ${gradeInfo.grade} (${gradeInfo.label})

EXCURSION TELEMETRY:
Peak MFE:     +₹${peakMfePnl.toLocaleString('en-IN')} (${peakMfeR !== null ? `+${peakMfeR}R` : '—'})
Captured:     ${mfeCaptureEfficiency}% of Peak Move
Charges:      ₹${totalFees.toFixed(2)} (Brokerage & STT)
Discipline:   ${selectedDiscipline === 'FOLLOWED_PLAN' ? 'Rule Followed (100%)' : 'Rules Broken'}
Mindset:      ${selectedEmotion}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Verified by SetupMint Private Journal`;

    navigator.clipboard.writeText(receiptText);
    toast.success('📋 Trade receipt copied to clipboard!');
  };

  if (!trade) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: '20px',
            bgcolor: isDark ? 'rgba(15, 23, 42, 0.98)' : '#FFFFFF',
            backdropFilter: 'blur(20px)',
            border: `1px solid ${muiTheme.palette.divider}`,
            boxShadow: isDark
              ? '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 40px rgba(59, 130, 246, 0.15)'
              : '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
            overflow: 'hidden',
          },
        },
      }}
    >
      {/* Top Accent Gradient Bar */}
      <Box
        sx={{
          height: '4px',
          background: isProfitable
            ? 'linear-gradient(90deg, #10B981, #06B6D4)'
            : 'linear-gradient(90deg, #F43F5E, #FB923C)',
        }}
      />

      <DialogTitle
        sx={{
          p: 2.5,
          pb: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: '10px',
              bgcolor: isProfitable ? alpha('#10B981', 0.15) : alpha('#F43F5E', 0.15),
              color: isProfitable ? '#10B981' : '#F43F5E',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ReceiptLongRoundedIcon fontSize="small" />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '1.05rem', lineHeight: 1.2 }}>
              Flight Recorder & Trade Receipt
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
              Execution quality debrief and instant discipline capture
            </Typography>
          </Box>
        </Box>

        <IconButton size="small" onClick={onClose} sx={{ color: 'text.secondary' }}>
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 2.5, pt: 1 }}>
        {/* 1. Master Financial Hero Banner */}
        <Card
          variant="outlined"
          sx={{
            p: 2,
            mb: 2,
            borderRadius: '14px',
            bgcolor: isDark ? 'rgba(30, 41, 59, 0.5)' : '#F8FAFC',
            borderColor: isProfitable ? alpha('#10B981', 0.4) : alpha('#F43F5E', 0.4),
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
          }}
        >
          {/* Symbol, Side & Lots */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, letterSpacing: -0.2 }}>
                {symbol}
              </Typography>
              <Chip
                label={direction}
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.65rem',
                  fontWeight: 800,
                  color: isLong ? '#10B981' : '#A855F7',
                  bgcolor: alpha(isLong ? '#10B981' : '#A855F7', 0.12),
                  borderRadius: '4px',
                }}
              />
              <Chip
                label={`${quantity} Qty`}
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  bgcolor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                  borderRadius: '4px',
                }}
              />
            </Box>

            {/* Execution Grade Badge */}
            <Chip
              icon={<EmojiEventsRoundedIcon sx={{ fontSize: '13px !important', color: gradeInfo.color }} />}
              label={`GRADE ${gradeInfo.grade}`}
              size="small"
              sx={{
                height: 24,
                fontSize: '0.72rem',
                fontWeight: 900,
                color: gradeInfo.color,
                bgcolor: gradeInfo.bg,
                border: `1px solid ${alpha(gradeInfo.color, 0.4)}`,
                borderRadius: '6px',
              }}
            />
          </Box>

          {/* Large P&L Readout & R-Multiple */}
          <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 700 }}>
                Realized Net Outcome
              </Typography>
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 900,
                  color: isProfitable ? '#10B981' : '#F43F5E',
                  letterSpacing: -0.5,
                  lineHeight: 1.1,
                }}
              >
                {isProfitable ? '+' : ''}
                {formatCurrency(netPnL, 'INR')}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {realizedR !== null && (
                <Chip
                  label={`${realizedR >= 0 ? '+' : ''}${realizedR} R`}
                  size="small"
                  sx={{
                    height: 28,
                    px: 0.5,
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    color: isProfitable ? '#10B981' : '#F43F5E',
                    bgcolor: alpha(isProfitable ? '#10B981' : '#F43F5E', 0.15),
                    borderRadius: '8px',
                  }}
                />
              )}
            </Box>
          </Box>

          {/* Fill Prices & Duration */}
          <Divider sx={{ my: 0.25 }} />
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', color: 'text.secondary' }}>
            <span>Entry: <strong style={{ color: muiTheme.palette.text.primary, fontFamily: 'monospace' }}>₹{entryPrice}</strong> ➔ Exit: <strong style={{ color: muiTheme.palette.text.primary, fontFamily: 'monospace' }}>₹{exitPrice}</strong></span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <AccessTimeRoundedIcon sx={{ fontSize: 13 }} />
              Duration: <strong style={{ color: muiTheme.palette.text.primary }}>{durationStr}</strong>
            </span>
          </Box>
        </Card>

        {/* 2. Key Telemetry Grid: MFE Efficiency & Friction */}
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          {/* MFE Capture Efficiency */}
          <Grid size={{ xs: 6 }}>
            <Box
              sx={{
                p: 1.25,
                borderRadius: '10px',
                bgcolor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                border: '1px solid',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
                height: '100%',
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase' }}>
                MFE Capture Efficiency
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 800, color: mfeCaptureEfficiency >= 60 ? '#10B981' : '#F59E0B' }}>
                {mfeCaptureEfficiency}%
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.64rem', display: 'block' }}>
                Peak: +₹{peakMfePnl.toFixed(0)} ({peakMfeR !== null ? `+${peakMfeR}R` : '—'})
              </Typography>
              {reviewData.surrenderedGivebackPnl > 0 && (
                <Typography variant="caption" sx={{ fontSize: '0.62rem', color: '#F59E0B', fontWeight: 700, display: 'block' }}>
                  Giveback: -₹{reviewData.surrenderedGivebackPnl.toFixed(0)} ({reviewData.surrenderedGivebackPercent}%)
                </Typography>
              )}
            </Box>
          </Grid>

          {/* Statutory Friction & Indian Charges */}
          <Grid size={{ xs: 6 }}>
            <Box
              sx={{
                p: 1.25,
                borderRadius: '10px',
                bgcolor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                border: '1px solid',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
                height: '100%',
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase' }}>
                Total Charges (Friction)
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                {formatCurrency(totalFees, 'INR')}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.64rem' }}>
                Gross P&L: {formatCurrency(grossPnL, 'INR')}
              </Typography>
            </Box>
          </Grid>
        </Grid>

        {/* In-Trade Emotional Journey (Pulse Checkpoints) */}
        {reviewData.pulseCheckIns.length > 0 && (
          <Box
            sx={{
              p: 1.5,
              mb: 2,
              borderRadius: '10px',
              bgcolor: isDark ? 'rgba(59, 130, 246, 0.05)' : 'rgba(59, 130, 246, 0.03)',
              border: '1px solid',
              borderColor: isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.15)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="caption" sx={{ fontWeight: 800, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: 0.3, color: '#3B82F6', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <PsychologyRoundedIcon sx={{ fontSize: 14 }} />
                In-Trade Emotional Journey ({reviewData.pulseCheckIns.length} Checkpoints)
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.64rem' }}>
                Chronological Timeline
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, overflowX: 'auto', pb: 0.5 }}>
              {reviewData.pulseCheckIns.map((pulse, pIdx) => {
                const timeStr = new Date(pulse.timestamp).toLocaleTimeString('en-IN', {
                  timeZone: 'Asia/Kolkata',
                  hour: '2-digit',
                  minute: '2-digit',
                });
                const isCalm = pulse.emotion === 'CALM';
                const isAnxious = pulse.emotion === 'ANXIOUS';
                const chipColor = isCalm ? '#10B981' : isAnxious ? '#EF4444' : '#F59E0B';

                return (
                  <React.Fragment key={pIdx}>
                    {pIdx > 0 && (
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
                        &rarr;
                      </Typography>
                    )}
                    <Tooltip title={pulse.notes ? `Note: "${pulse.notes}"` : 'No notes'} arrow>
                      <Chip
                        size="small"
                        label={`${timeStr}: ${pulse.emotion} (${pulse.unrealizedR !== undefined ? `${pulse.unrealizedR >= 0 ? '+' : ''}${pulse.unrealizedR.toFixed(1)}R` : ''})`}
                        sx={{
                          height: 22,
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          fontFamily: 'monospace',
                          bgcolor: alpha(chipColor, 0.12),
                          color: chipColor,
                          border: `1px solid ${alpha(chipColor, 0.3)}`,
                        }}
                      />
                    </Tooltip>
                  </React.Fragment>
                );
              })}
            </Box>
          </Box>
        )}

        {/* Algorithmic Mistake Suggestions */}
        {reviewData.suggestedMistakes.length > 0 && (
          <Box
            sx={{
              p: 1.5,
              mb: 2,
              borderRadius: '10px',
              bgcolor: isDark ? 'rgba(239, 68, 68, 0.05)' : 'rgba(239, 68, 68, 0.03)',
              border: '1px solid',
              borderColor: isDark ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.18)',
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 800, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: 0.3, color: '#EF4444', display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
              ⚠️ Algorithmic Mistake Suggestions (Click to Tag):
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
              {reviewData.suggestedMistakes.map((mistake) => {
                const isTagged = selectedMistakes.includes(mistake.id);
                return (
                  <Tooltip key={mistake.id} title={mistake.description} arrow>
                    <Chip
                      label={`${isTagged ? '✓ ' : '+ '}${mistake.label}`}
                      clickable
                      size="small"
                      onClick={() => {
                        setSelectedMistakes((prev) =>
                          isTagged ? prev.filter((m) => m !== mistake.id) : [...prev, mistake.id]
                        );
                      }}
                      sx={{
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        bgcolor: isTagged ? alpha('#EF4444', 0.2) : 'transparent',
                        border: '1px solid',
                        borderColor: isTagged ? '#EF4444' : isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
                        color: isTagged ? '#EF4444' : 'text.primary',
                      }}
                    />
                  </Tooltip>
                );
              })}
            </Box>
          </Box>
        )}

        {/* 3. 5-Second Emotional & Discipline Audit */}
        <Box
          sx={{
            p: 1.75,
            borderRadius: '12px',
            bgcolor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.015)',
            border: '1px solid',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
            display: 'flex',
            flexDirection: 'column',
            gap: 1.25,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="caption" sx={{ fontWeight: 800, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 0.3, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <PsychologyRoundedIcon sx={{ fontSize: 15, color: '#3B82F6' }} />
              5-Second Psychology & Discipline Audit
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
              Instant Self-Reflection
            </Typography>
          </Box>

          {/* Emotional State Buttons */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
            {[
              { id: 'CALM', label: '😌 Calm', color: '#10B981' },
              { id: 'ANXIOUS', label: '🚨 Anxious', color: '#EF4444' },
              { id: 'FOMO', label: '⚡ FOMO', color: '#F59E0B' },
              { id: 'GREEDY', label: '💰 Greedy', color: '#EC4899' },
            ].map((emo) => {
              const active = selectedEmotion === emo.id;
              return (
                <Button
                  key={emo.id}
                  size="small"
                  variant={active ? 'contained' : 'outlined'}
                  onClick={() => setSelectedEmotion(emo.id)}
                  sx={{
                    minWidth: 'auto',
                    py: 0.4,
                    px: 1.2,
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    borderRadius: '6px',
                    textTransform: 'none',
                    bgcolor: active ? emo.color : 'transparent',
                    color: active ? '#FFFFFF' : 'text.secondary',
                    borderColor: active ? emo.color : isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                    '&:hover': {
                      bgcolor: active ? emo.color : alpha(emo.color, 0.1),
                    },
                  }}
                >
                  {emo.label}
                </Button>
              );
            })}
          </Box>

          {/* Discipline Selector */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Button
              size="small"
              variant={selectedDiscipline === 'FOLLOWED_PLAN' ? 'contained' : 'outlined'}
              color="success"
              onClick={() => setSelectedDiscipline('FOLLOWED_PLAN')}
              startIcon={<CheckCircleRoundedIcon sx={{ fontSize: 13 }} />}
              sx={{
                flex: 1,
                py: 0.5,
                fontSize: '0.7rem',
                fontWeight: 700,
                textTransform: 'none',
                borderRadius: '6px',
              }}
            >
              Followed Plan 100%
            </Button>

            <Button
              size="small"
              variant={selectedDiscipline === 'BROKE_RULES' ? 'contained' : 'outlined'}
              color="error"
              onClick={() => setSelectedDiscipline('BROKE_RULES')}
              startIcon={<ShieldRoundedIcon sx={{ fontSize: 13 }} />}
              sx={{
                flex: 1,
                py: 0.5,
                fontSize: '0.7rem',
                fontWeight: 700,
                textTransform: 'none',
                borderRadius: '6px',
              }}
            >
              Broke Trading Rules
            </Button>
          </Box>

          {/* Reflection Note */}
          <TextField
            size="small"
            placeholder="Quick lesson or takeaway from this execution..."
            value={auditNotes}
            onChange={(e) => setAuditNotes(e.target.value)}
            fullWidth
            sx={{
              '& .MuiInputBase-root': {
                fontSize: '0.75rem',
                borderRadius: '6px',
              },
            }}
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 2.5, pt: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<ContentCopyRoundedIcon sx={{ fontSize: 14 }} />}
          onClick={handleCopyReceipt}
          sx={{
            fontSize: '0.72rem',
            fontWeight: 700,
            textTransform: 'none',
            borderRadius: '8px',
          }}
        >
          Copy Trade Receipt
        </Button>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button
            size="small"
            variant="contained"
            color="primary"
            onClick={async () => {
              await handleSaveAudit();
              onClose();
            }}
            disabled={isSavingAudit}
            sx={{
              fontSize: '0.72rem',
              fontWeight: 800,
              textTransform: 'none',
              borderRadius: '8px',
              px: 2,
            }}
          >
            {isSavingAudit ? 'Saving...' : 'Done'}
          </Button>

          <Button
            size="small"
            variant="text"
            endIcon={<OpenInNewRoundedIcon sx={{ fontSize: 13 }} />}
            onClick={async () => {
              await handleSaveAudit();
              onClose();
              navigate(`/trades/${trade._id || trade.id}`);
            }}
            disabled={isSavingAudit}
            sx={{
              fontSize: '0.72rem',
              fontWeight: 700,
              textTransform: 'none',
              color: 'text.secondary',
              '&:hover': {
                color: 'primary.main',
              },
            }}
          >
            Review in Journal
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}

