import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Button,
  TextField,
  Chip,
  Avatar,
  CircularProgress,
  Tooltip,
  Paper,
  Divider,
} from '@mui/material';
import { useTheme as useMuiTheme, alpha } from '@mui/material/styles';

// Icons
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import PsychologyRoundedIcon from '@mui/icons-material/PsychologyRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import TipsAndUpdatesRoundedIcon from '@mui/icons-material/TipsAndUpdatesRounded';
import SpeedRoundedIcon from '@mui/icons-material/SpeedRounded';

import { api } from '../../lib/api.js';
import { useAccountScope } from '../../context/AccountScopeContext.js';
import { toast } from '../../context/ToastContext.js';
import { IAiCopilotMessage, IAiCopilotSuggestion } from '@tradevault/shared';

export interface AiCopilotDrawerProps {
  open: boolean;
  onClose: () => void;
  initialQuestion?: string;
}

export function AiCopilotDrawer({ open, onClose, initialQuestion }: AiCopilotDrawerProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';
  const navigate = useNavigate();
  const { selectedScopeValue, selectedAccountId } = useAccountScope();

  const [inputQuestion, setInputQuestion] = useState('');
  const [messages, setMessages] = useState<IAiCopilotMessage[]>([]);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch contextual suggestions based on current active scope
  const { data: suggestionsData } = useQuery({
    queryKey: ['ai-copilot-suggestions', selectedScopeValue],
    queryFn: async () => {
      const res = await api.ai.getSuggestions(selectedScopeValue);
      return res?.data || [];
    },
    enabled: open,
    staleTime: 60000,
  });

  const suggestions: IAiCopilotSuggestion[] = suggestionsData || [];

  // Ask Copilot mutation
  const copilotMutation = useMutation({
    mutationFn: async (questionText: string) => {
      const history = messages.slice(-4).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await api.ai.askCopilot({
        question: questionText,
        scopeKey: selectedScopeValue,
        accountId: selectedAccountId !== 'ALL' ? selectedAccountId : undefined,
        history,
      });

      return res?.data?.message;
    },
    onSuccess: (assistantMsg) => {
      if (assistantMsg) {
        setMessages((prev) => [...prev, assistantMsg]);
      }
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Copilot failed to generate a response');
      const errorMsg: IAiCopilotMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `⚠️ **Error:** ${err?.message || 'Unable to connect to Copilot service. Please try again.'}`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    },
  });

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, copilotMutation.isPending]);

  // Handle initial question if triggered externally (e.g. from command palette)
  useEffect(() => {
    if (open && initialQuestion && initialQuestion.trim()) {
      handleSend(initialQuestion.trim());
    }
  }, [open, initialQuestion]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
    }
  }, [open]);

  const handleSend = (textToSend?: string) => {
    const q = (textToSend || inputQuestion).trim();
    if (!q || copilotMutation.isPending) return;

    const userMsg: IAiCopilotMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: q,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuestion('');
    copilotMutation.mutate(q);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearHistory = () => {
    setMessages([]);
  };

  const handleActionClick = (action: any) => {
    if (action.actionType === 'NAVIGATE' && action.path) {
      onClose();
      navigate(action.path);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{
        '& .MuiDrawer-paper': {
          width: { xs: '100%', sm: 460, md: 520 },
          display: 'flex',
          flexDirection: 'column',
          bgcolor: isDark ? '#0f172a' : '#f8fafc',
          borderLeft: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
          boxShadow: isDark ? '-8px 0 32px rgba(0,0,0,0.6)' : '-8px 0 32px rgba(0,0,0,0.1)',
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 2,
          px: 2.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
          bgcolor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(8px)',
          zIndex: 10,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Avatar
            sx={{
              bgcolor: alpha(muiTheme.palette.primary.main, 0.15),
              color: muiTheme.palette.primary.main,
              width: 36,
              height: 36,
              border: `1px solid ${alpha(muiTheme.palette.primary.main, 0.3)}`,
            }}
          >
            <AutoAwesomeRoundedIcon sx={{ fontSize: 20 }} />
          </Avatar>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                SetupMint Copilot
              </Typography>
              <Chip
                label="AI Desk Partner"
                size="small"
                sx={{
                  height: 18,
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  bgcolor: alpha(muiTheme.palette.primary.main, 0.15),
                  color: muiTheme.palette.primary.main,
                }}
              />
            </Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <SpeedRoundedIcon sx={{ fontSize: 13, color: '#10b981' }} />
              Grounded with 30-digit financial engine precision
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {messages.length > 0 && (
            <Tooltip title="Clear chat history">
              <IconButton size="small" onClick={handleClearHistory} sx={{ color: 'text.secondary' }}>
                <DeleteOutlineRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <IconButton size="small" onClick={onClose} sx={{ color: 'text.secondary' }}>
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      {/* Messages Stream */}
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          p: 2.5,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {messages.length === 0 ? (
          <Box sx={{ my: 'auto', textAlign: 'center', px: 1 }}>
            <Avatar
              sx={{
                bgcolor: alpha(muiTheme.palette.primary.main, 0.1),
                color: muiTheme.palette.primary.main,
                width: 56,
                height: 56,
                mx: 'auto',
                mb: 2,
              }}
            >
              <PsychologyRoundedIcon sx={{ fontSize: 32 }} />
            </Avatar>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
              Ask SetupMint Copilot
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3, maxWidth: 380, mx: 'auto' }}>
              Your conversational quant partner. Ask about your win rates, revenge-trading losses,
              strategy edges, or market leak diagnostics.
            </Typography>

            {/* Contextual Suggestions */}
            {suggestions.length > 0 && (
              <Box sx={{ textAlign: 'left', mb: 2 }}>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: 'text.secondary',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    mb: 1.5,
                  }}
                >
                  <TipsAndUpdatesRoundedIcon sx={{ fontSize: 14, color: '#f59e0b' }} />
                  Suggested Inquiries:
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {suggestions.map((s, idx) => (
                    <Paper
                      key={idx}
                      elevation={0}
                      onClick={() => handleSend(s.prompt)}
                      sx={{
                        p: 1.5,
                        borderRadius: 2,
                        cursor: 'pointer',
                        bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                        border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
                        transition: 'all 0.15s ease-in-out',
                        '&:hover': {
                          bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                          borderColor: muiTheme.palette.primary.main,
                          transform: 'translateX(3px)',
                        },
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', mb: 0.3 }}>
                        {s.title}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        "{s.prompt}"
                      </Typography>
                    </Paper>
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <Box
                key={msg.id}
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isUser ? 'flex-end' : 'flex-start',
                  gap: 0.5,
                }}
              >
                {/* Bubble */}
                <Paper
                  elevation={0}
                  sx={{
                    p: 2,
                    borderRadius: 2.5,
                    maxWidth: '90%',
                    bgcolor: isUser
                      ? muiTheme.palette.primary.main
                      : isDark
                      ? 'rgba(30, 41, 59, 0.7)'
                      : '#ffffff',
                    color: isUser ? '#ffffff' : 'text.primary',
                    border: isUser
                      ? 'none'
                      : `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                    boxShadow: isUser
                      ? `0 4px 12px ${alpha(muiTheme.palette.primary.main, 0.3)}`
                      : '0 2px 8px rgba(0,0,0,0.04)',
                  }}
                >
                  <Typography
                    variant="body2"
                    component="div"
                    sx={{
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                      '& strong, & b': { fontWeight: 700 },
                      '& h3, & h4': {
                        fontSize: '1rem',
                        fontWeight: 700,
                        my: 1,
                        color: isUser ? '#ffffff' : muiTheme.palette.primary.main,
                      },
                      '& blockquote': {
                        borderLeft: `3px solid ${isUser ? '#ffffff' : muiTheme.palette.primary.main}`,
                        pl: 1.5,
                        my: 1,
                        py: 0.5,
                        fontStyle: 'italic',
                        bgcolor: isUser ? 'rgba(255,255,255,0.1)' : alpha(muiTheme.palette.primary.main, 0.05),
                        borderRadius: '0 4px 4px 0',
                      },
                    }}
                  >
                    {msg.content}
                  </Typography>

                  {/* Render Visual Data Cards if attached */}
                  {msg.dataCards && msg.dataCards.length > 0 && (
                    <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {msg.dataCards.map((card, cIdx) => (
                        <Box
                          key={cIdx}
                          sx={{
                            p: 1.5,
                            borderRadius: 1.5,
                            bgcolor: isDark ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.03)',
                            border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}`,
                          }}
                        >
                          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}>
                            {card.title}
                          </Typography>
                          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1, mt: 1 }}>
                            {Object.entries(card.metrics || {}).map(([k, v], mIdx) => (
                              <Box key={mIdx}>
                                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                                  {k}
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                  {String(v)}
                                </Typography>
                              </Box>
                            ))}
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  )}

                  {/* Render Action Buttons if provided */}
                  {msg.suggestedActions && msg.suggestedActions.length > 0 && (
                    <Box sx={{ mt: 1.5, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {msg.suggestedActions.map((action, aIdx) => (
                        <Button
                          key={aIdx}
                          variant="outlined"
                          size="small"
                          endIcon={<ArrowForwardRoundedIcon sx={{ fontSize: 14 }} />}
                          onClick={() => handleActionClick(action)}
                          sx={{
                            fontSize: '0.75rem',
                            py: 0.4,
                            px: 1.2,
                            borderRadius: 1.5,
                            borderColor: alpha(muiTheme.palette.primary.main, 0.4),
                            textTransform: 'none',
                          }}
                        >
                          {action.label}
                        </Button>
                      ))}
                    </Box>
                  )}
                </Paper>

                {/* Model tag & timestamp */}
                {!isUser && msg.modelUsed && (
                  <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary', px: 1 }}>
                    {msg.modelUsed}
                  </Typography>
                )}
              </Box>
            );
          })
        )}

        {/* Loading Spinner */}
        {copilotMutation.isPending && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5 }}>
            <CircularProgress size={18} sx={{ color: muiTheme.palette.primary.main }} />
            <Typography variant="caption" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
              SetupMint Copilot analyzing trading ledger & telemetry...
            </Typography>
          </Box>
        )}

        <div ref={chatBottomRef} />
      </Box>

      {/* Input Footer */}
      <Box
        sx={{
          p: 2,
          borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
          bgcolor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TextField
            inputRef={inputRef}
            fullWidth
            size="small"
            placeholder="Ask Copilot (e.g. 'What is my win rate?', 'Revenge cost')..."
            value={inputQuestion}
            onChange={(e) => setInputQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={copilotMutation.isPending}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                bgcolor: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
              },
            }}
          />
          <IconButton
            color="primary"
            onClick={() => handleSend()}
            disabled={!inputQuestion.trim() || copilotMutation.isPending}
            sx={{
              bgcolor: alpha(muiTheme.palette.primary.main, 0.15),
              '&:hover': { bgcolor: alpha(muiTheme.palette.primary.main, 0.25) },
              borderRadius: 2,
              p: 1.1,
            }}
          >
            <SendRoundedIcon fontSize="small" />
          </IconButton>
        </Box>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', mt: 0.8, display: 'block' }}>
          Tip: Press <b>Enter</b> to send. All calculations are grounded by the verified financial engine.
        </Typography>
      </Box>
    </Drawer>
  );
}

