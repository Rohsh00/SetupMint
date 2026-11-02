import React, { useState, useRef, useEffect, useCallback } from 'react';
import Button, { ButtonProps } from '@mui/material/Button';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import { alpha, useTheme as useMuiTheme } from '@mui/material/styles';

export interface HoldToConfirmButtonProps extends Omit<ButtonProps, 'onClick'> {
  onConfirm: () => void;
  holdDurationMs?: number; // default 600ms
  disabledReason?: string;
  holdingText?: string;
  completedText?: string;
}

/**
 * HoldToConfirmButton
 * Requires pressing and holding for ~600ms (with visible SVG progress ring)
 * to prevent accidental clicks on live broker execution actions.
 */
export function HoldToConfirmButton({
  onConfirm,
  holdDurationMs = 600,
  disabled = false,
  disabledReason,
  holdingText,
  completedText,
  children,
  startIcon,
  sx,
  color = 'primary',
  variant = 'contained',
  size = 'small',
  ...rest
}: HoldToConfirmButtonProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  const [isHolding, setIsHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);

  const startTimeRef = useRef<number | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isHoldingRef = useRef(false);

  const cancelHold = useCallback(() => {
    isHoldingRef.current = false;
    setIsHolding(false);
    setProgress(0);
    startTimeRef.current = null;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  const completeHold = useCallback(() => {
    cancelHold();
    setIsCompleted(true);
    onConfirm();
    setTimeout(() => {
      setIsCompleted(false);
    }, 1200);
  }, [cancelHold, onConfirm]);

  const tick = useCallback(() => {
    if (!isHoldingRef.current || startTimeRef.current === null) return;
    const elapsed = Date.now() - startTimeRef.current;
    const currentProgress = Math.min(100, (elapsed / holdDurationMs) * 100);
    setProgress(currentProgress);

    if (currentProgress >= 100) {
      completeHold();
    } else {
      animFrameRef.current = requestAnimationFrame(tick);
    }
  }, [holdDurationMs, completeHold]);

  const startHold = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled || isCompleted) return;
      // Only trigger on primary button (left click) or touch
      if (e.button !== undefined && e.button !== 0) return;

      isHoldingRef.current = true;
      setIsHolding(true);
      startTimeRef.current = Date.now();
      animFrameRef.current = requestAnimationFrame(tick);
    },
    [disabled, isCompleted, tick]
  );

  useEffect(() => {
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  // Keyboard accessibility: hold space/enter
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || isCompleted) return;
    if (e.key === ' ' || e.key === 'Enter') {
      if (!isHoldingRef.current) {
        e.preventDefault();
        isHoldingRef.current = true;
        setIsHolding(true);
        startTimeRef.current = Date.now();
        animFrameRef.current = requestAnimationFrame(tick);
      }
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      cancelHold();
    }
  };

  const buttonElement = (
    <span>
      <Button
        variant={variant}
        color={color}
        size={size}
        disabled={disabled}
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        startIcon={
          isHolding ? (
            <CircularProgress
              variant="determinate"
              value={progress}
              size={14}
              thickness={6}
              sx={{
                color: 'inherit',
                animation: 'none',
              }}
            />
          ) : (
            startIcon
          )
        }
        sx={{
          position: 'relative',
          overflow: 'hidden',
          transition: 'transform 0.1s ease, background-color 0.15s ease',
          transform: isHolding ? 'scale(0.97)' : 'none',
          userSelect: 'none',
          WebkitTouchCallout: 'none',
          ...sx,
        }}
        {...rest}
      >
        {/* Subtle linear background progress track */}
        {isHolding && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: `${progress}%`,
              bgcolor: alpha('#FFFFFF', isDark ? 0.15 : 0.25),
              pointerEvents: 'none',
              zIndex: 0,
              transition: 'width 0.05s linear',
            }}
          />
        )}
        <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center' }}>
          {isCompleted && completedText
            ? completedText
            : isHolding && holdingText
            ? `${holdingText} (${Math.round(progress)}%)`
            : isHolding
            ? `Hold to Confirm...`
            : children}
        </Box>
      </Button>
    </span>
  );

  if (disabled && disabledReason) {
    return (
      <Tooltip title={disabledReason} arrow>
        {buttonElement}
      </Tooltip>
    );
  }

  return (
    <Tooltip
      title={
        isHolding
          ? 'Keep holding to execute order...'
          : 'Hold button for ~0.6s to confirm and execute'
      }
      arrow
      disableHoverListener={isHolding}
    >
      {buttonElement}
    </Tooltip>
  );
}

