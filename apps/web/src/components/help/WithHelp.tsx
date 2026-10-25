import React from 'react';
import Box from '@mui/material/Box';
import { HelpKey } from '@tradevault/shared';
import { HelpHint, HelpHintProps } from './HelpHint.js';

export interface WithHelpProps {
  hintKey: HelpKey;
  children: React.ReactNode;
  size?: HelpHintProps['size'];
  color?: HelpHintProps['color'];
  sx?: any;
}

export const WithHelp: React.FC<WithHelpProps> = ({
  hintKey,
  children,
  size = 'small',
  color = 'default',
  sx = {},
}) => {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        ...sx,
      }}
    >
      {children}
      <HelpHint hintKey={hintKey} size={size} color={color} />
    </Box>
  );
};
