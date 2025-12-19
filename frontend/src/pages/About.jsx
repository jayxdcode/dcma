import React from 'react';
import { Typography, Paper } from '@mui/material';

export default function About(){
  return (
    <Paper className="card">
      <Typography className="page-title">About</Typography>
      <Typography className="small">This UI uses Material UI and regular CSS. Themes: Catppuccin presets + image palette.</Typography>
    </Paper>
  );
}
