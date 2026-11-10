import React, { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  MenuItem,
  Button,
  Alert,
  Link,
  useTheme,
} from '@mui/material';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import { useAuth } from '../context/AuthContext.js';
import { SetupMintLogo } from '../components/brand/SetupMintLogo.js';
import { toast } from '../context/ToastContext.js';

export function RegisterPage() {
  const muiTheme = useTheme();
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accountPreset, setAccountPreset] = useState<'INDIA_EQUITIES_FNO' | 'FOREX_CFD' | 'PROP_FIRM' | 'CUSTOM'>('FOREX_CFD');
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handlePresetChange = (preset: 'INDIA_EQUITIES_FNO' | 'FOREX_CFD' | 'PROP_FIRM' | 'CUSTOM') => {
    setAccountPreset(preset);
    if (preset === 'INDIA_EQUITIES_FNO') setBaseCurrency('INR');
    else if (preset === 'FOREX_CFD') setBaseCurrency('USD');
    else if (preset === 'PROP_FIRM') setBaseCurrency('USD');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password || !baseCurrency) {
      toast.warning('Please fill in all required fields and choose your account profile.');
      return;
    }
    if (password.length < 8) {
      toast.warning('Password must be at least 8 characters long.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await registerUser({ name, email, password, baseCurrency });
      toast.success('Account created successfully!');
      navigate('/');
    } catch (err: any) {
      const msg = err.message || 'Registration failed';
      setError(msg);
      toast.error(msg);
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
            <SetupMintLogo size="lg" />
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.02em' }}>
                Create SetupMint Account
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Trade. Track. Improve. Set up your professional trading journal
              </Typography>
            </Box>
          </Box>

          {error && (
            <Alert severity="error">
              {error}
            </Alert>
          )}

          {/* Register Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <TextField
              label="Full Name"
              type="text"
              size="small"
              required
              fullWidth
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Komal Trader"
            />

            <TextField
              label="Email Address"
              type="email"
              size="small"
              required
              fullWidth
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="trader@domain.com"
              autoComplete="email"
            />

            <TextField
              label="Password (Min 8 chars)"
              type="password"
              size="small"
              required
              fullWidth
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              slotProps={{ htmlInput: { minLength: 8 } }}
              autoComplete="new-password"
            />

            <TextField
              select
              label="Primary Account Profile & Market"
              size="small"
              fullWidth
              required
              value={accountPreset}
              onChange={(e) => handlePresetChange(e.target.value as any)}
              helperText="Determines your market sessions, fee calculations, and base currency"
            >
              <MenuItem value="FOREX_CFD">Global Forex & CFD / Elefin (USD, 24/5 Calendar)</MenuItem>
              <MenuItem value="INDIA_EQUITIES_FNO">Indian Equities & F&O / FYERS (INR, NSE/IST)</MenuItem>
              <MenuItem value="PROP_FIRM">Prop Firm Challenge (USD, Pre-trade Risk Guards)</MenuItem>
              <MenuItem value="CUSTOM">Custom Market & Base Currency</MenuItem>
            </TextField>

            <TextField
              select
              label="Account Base Currency"
              size="small"
              fullWidth
              required
              value={baseCurrency}
              onChange={(e) => setBaseCurrency(e.target.value)}
              disabled={accountPreset !== 'CUSTOM'}
            >
              <MenuItem value="USD">US Dollar (USD)</MenuItem>
              <MenuItem value="INR">Indian Rupee (INR)</MenuItem>
              <MenuItem value="EUR">Euro (EUR)</MenuItem>
              <MenuItem value="GBP">British Pound (GBP)</MenuItem>
              <MenuItem value="AED">UAE Dirham (AED)</MenuItem>
            </TextField>

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
              {loading ? 'Creating account...' : 'Create Account'}
            </Button>
          </form>

          <Box sx={{ textAlign: 'center', pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Already have an account?{' '}
              <Link component={RouterLink} to="/login" sx={{ fontWeight: 600, color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
                Sign In
              </Link>
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
