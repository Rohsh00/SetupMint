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
  useTheme,
} from '@mui/material';
import {
  ArrowForwardRounded,
  AutoAwesomeRounded,
  LockRounded,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext.js';
import { StratumLogo } from '../components/brand/StratumLogo.js';

export function LoginPage() {
  const muiTheme = useTheme();
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('trader@tradevault.local');
  const [password, setPassword] = useState('TradeVault@123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login({ email, password });
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Invalid credentials');
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
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Demo login failed');
    } finally {
      setLoading(false);
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
            <StratumLogo size="lg" />
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.02em' }}>
                Welcome to Stratum
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Sign in to your private discretionary trading journal
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

            <Button
              type="submit"
              variant="contained"
              color="primary"
              fullWidth
              size="large"
              disabled={loading}
              endIcon={<ArrowForwardRounded />}
              sx={{ fontWeight: 700, mt: 1 }}
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
    </Box>
  );
}
