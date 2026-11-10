import React, { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Alert,
  Divider,
  Link,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  InputAdornment,
  useTheme,
} from '@mui/material';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import LockResetRounded from '@mui/icons-material/LockResetRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import VisibilityRounded from '@mui/icons-material/VisibilityRounded';
import VisibilityOffRounded from '@mui/icons-material/VisibilityOffRounded';
import { useAuth } from '../context/AuthContext.js';
import { api } from '../lib/api.js';
import { SetupMintLogo } from '../components/brand/SetupMintLogo.js';
import { toast } from '../context/ToastContext.js';

export function LoginPage() {
  const muiTheme = useTheme();
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Forgot / Reset Password state
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.warning('Please enter your email and password.');
      return;
    }
    setError(null);
    setLoading(true);

    try {
      await login({ email, password });
      toast.success('Welcome back!');
      navigate('/');
    } catch (err: any) {
      const msg = err.message || 'Invalid credentials';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setEmail('trader@tradevault.local');
    setPassword('TradeVault@123');
    setError(null);
    setLoading(true);

    try {
      await login({ email: 'trader@tradevault.local', password: 'TradeVault@123' });
      toast.success('Welcome back! Demo account signed in.');
      navigate('/');
    } catch (err: any) {
      const msg = err.message || 'Demo login failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenForgotDialog = () => {
    setForgotEmail(email.trim());
    setForgotNewPassword('');
    setForgotConfirmPassword('');
    setForgotError(null);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setForgotOpen(true);
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);

    const targetEmail = forgotEmail.trim();
    if (!targetEmail) {
      setForgotError('Please enter your email address.');
      return;
    }

    if (!forgotNewPassword) {
      setForgotError('Please enter a new password.');
      return;
    }

    if (forgotNewPassword.length < 8) {
      setForgotError('New password must be at least 8 characters long.');
      return;
    }

    if (forgotNewPassword !== forgotConfirmPassword) {
      setForgotError('Passwords do not match. Please verify and re-enter.');
      return;
    }

    setForgotLoading(true);
    try {
      const res = await api.auth.forgotPassword({
        email: targetEmail,
        newPassword: forgotNewPassword,
      });

      toast.success(res.message || 'Password updated successfully! Please sign in with your new password.');
      setEmail(targetEmail);
      setPassword(forgotNewPassword);
      setError(null);
      setForgotOpen(false);
    } catch (err: any) {
      const msg = err.message || 'Failed to reset password. Please check your email.';
      setForgotError(msg);
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2,
        bgcolor: 'background.default',
      }}
    >
      <Card
        variant="outlined"
        sx={{
          width: '100%',
          maxWidth: 440,
          p: { xs: 2, sm: 3 },
          boxShadow: muiTheme.palette.mode === 'dark' ? '0 24px 64px rgba(0,0,0,0.6)' : '0 16px 40px rgba(0,0,0,0.08)',
        }}
      >
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Brand Header */}
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 1.5 }}>
            <SetupMintLogo size="lg" />
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.02em' }}>
                Welcome to SetupMint
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Sign in to your professional trading journal &amp; performance analytics
              </Typography>
            </Box>
          </Box>

          {error && (
            <Alert severity="error">
              {error}
            </Alert>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <TextField
              label="Email Address"
              type="email"
              size="small"
              required
              fullWidth
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />

            <TextField
              label="Password"
              type="password"
              size="small"
              required
              fullWidth
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: -1 }}>
              <Link
                component="button"
                type="button"
                variant="caption"
                onClick={handleOpenForgotDialog}
                sx={{
                  color: 'text.secondary',
                  textDecoration: 'none',
                  cursor: 'pointer',
                  '&:hover': { color: 'primary.main', textDecoration: 'underline' },
                }}
              >
                Forgot password?
              </Link>
            </Box>

            <Button
              type="submit"
              variant="contained"
              color="primary"
              fullWidth
              size="large"
              disabled={loading}
              endIcon={<ArrowForwardRounded />}
              sx={{ fontWeight: 700, mt: 0.5 }}
            >
              {loading ? 'Signing in...' : 'Sign In to Journal'}
            </Button>
          </form>

          <Divider sx={{ my: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              QUICK ACCESS
            </Typography>
          </Divider>

          {/* Demo Login Button */}
          <Button
            type="button"
            variant="outlined"
            color="primary"
            fullWidth
            onClick={handleDemoLogin}
            disabled={loading}
            startIcon={<AutoAwesomeRounded />}
            sx={{ fontWeight: 600, py: 1 }}
          >
            Login with Seed Demo Account
          </Button>

          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Don&apos;t have an account?{' '}
              <Link component={RouterLink} to="/register" sx={{ fontWeight: 600, color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
                Create an Account
              </Link>
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* Reset Password Dialog */}
      <Dialog
        open={forgotOpen}
        onClose={() => !forgotLoading && setForgotOpen(false)}
        maxWidth="xs"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              borderRadius: 2,
              p: 1,
              boxShadow: muiTheme.palette.mode === 'dark' ? '0 24px 64px rgba(0,0,0,0.8)' : '0 16px 40px rgba(0,0,0,0.12)',
            },
          },
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <LockResetRounded color="primary" />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Reset Password
            </Typography>
          </Box>
          <IconButton
            size="small"
            onClick={() => setForgotOpen(false)}
            disabled={forgotLoading}
            aria-label="close"
          >
            <CloseRounded fontSize="small" />
          </IconButton>
        </DialogTitle>

        <form onSubmit={handleForgotSubmit}>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Enter your registered account email and choose a new password.
            </Typography>

            {forgotError && (
              <Alert severity="error" sx={{ py: 0.5 }}>
                {forgotError}
              </Alert>
            )}

            <TextField
              label="Account Email"
              type="email"
              size="small"
              required
              fullWidth
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              autoComplete="email"
            />

            <TextField
              label="New Password"
              type={showNewPassword ? 'text' : 'password'}
              size="small"
              required
              fullWidth
              value={forgotNewPassword}
              onChange={(e) => setForgotNewPassword(e.target.value)}
              helperText="Must be at least 8 characters"
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={() => setShowNewPassword((prev) => !prev)}
                        edge="end"
                      >
                        {showNewPassword ? <VisibilityOffRounded fontSize="small" /> : <VisibilityRounded fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />

            <TextField
              label="Confirm New Password"
              type={showConfirmPassword ? 'text' : 'password'}
              size="small"
              required
              fullWidth
              value={forgotConfirmPassword}
              onChange={(e) => setForgotConfirmPassword(e.target.value)}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        edge="end"
                      >
                        {showConfirmPassword ? <VisibilityOffRounded fontSize="small" /> : <VisibilityRounded fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
          </DialogContent>

          <DialogActions sx={{ px: 3, pb: 2, pt: 1, gap: 1 }}>
            <Button
              type="button"
              variant="text"
              color="inherit"
              disabled={forgotLoading}
              onClick={() => setForgotOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={forgotLoading}
              startIcon={<LockResetRounded />}
              sx={{ fontWeight: 600 }}
            >
              {forgotLoading ? 'Updating...' : 'Update Password'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
}
