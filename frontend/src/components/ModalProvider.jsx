import React, { createContext, useContext, useState, useCallback } from 'react';
import {
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  TextField,
  Typography
} from '@mui/material';

// 1. Create the Context
const ModalContext = createContext();

export const ModalProvider = ({ children }) => {
  // Alert State
  const [alertData, setAlertData] = useState({ open: false, message: '', severity: 'success' });
  
  // Dialog State (Used for both Confirm and Prompt)
  const [dialog, setDialog] = useState({
    open: false,
    title: '',
    message: '',
    label: '',
    isPrompt: false,
    resolve: null, // This stores the Promise resolver
  });

  const [promptValue, setPromptValue] = useState('');

  // --- THE FUNCTIONS ---

  // Standard non-blocking Alert
  const showAlert = useCallback((message, severity = 'success') => {
    setAlertData({ open: true, message, severity });
  }, []);

  // Promise-based Confirm
  const showConfirm = useCallback((title, message, severity = 'info') => {
    return new Promise((resolve) => {
      setDialog({
        open: true,
        title,
        message,
        severity,
        isPrompt: false,
        resolve
      });
    });
  }, []);

  // Promise-based Prompt
  const showPrompt = useCallback((title, label, defaultValue = '', severity = 'info') => {
    setPromptValue(defaultValue);
    return new Promise((resolve) => {
      setDialog({
        open: true,
        title,
        label,
        severity,
        isPrompt: true,
        resolve
      });
    });
  }, []);

  // --- HANDLERS ---

  const handleCloseDialog = (value) => {
    if (dialog.resolve) {
      // If it's a prompt, return the string; if confirm, return boolean
      dialog.resolve(value); 
    }
    setDialog({ ...dialog, open: false, resolve: null });
  };

  const sharedPaperStyles = {
    sx: {
      backgroundColor: 'var(--surface2)',
      backgroundImage: 'none',
      color: 'var(--text)',
      borderRadius: '12px',
      minWidth: '320px',
      zIndex: 'var(--player-z)' // Ensuring it sits above player layers
    }
  };

  return (
    <ModalContext.Provider value={{ showAlert, showConfirm, showPrompt }}>
      {children}

      {/* 1. Global Alert (Snackbar) */}
      <Snackbar
        open={alertData.open}
        autoHideDuration={4000}
        onClose={() => setAlertData({ ...alertData, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        sx={{ zIndex: 9900 }}
      >
        <Alert 
          variant="filled" 
          severity={alertData.severity}
          sx={{ bgcolor: `var(--${alertData.severity})` }}
        >
          {alertData.message}
        </Alert>
      </Snackbar>

      {/* 2. Global Dialog (Confirm / Prompt) */}
      <Dialog open={dialog.open} PaperProps={sharedPaperStyles}>
        <DialogTitle>{dialog.title}</DialogTitle>
        <DialogContent>
          {dialog.message && (
            <DialogContentText sx={{ color: 'var(--subtext0)', mb: 2 }}>
              {dialog.message}
            </DialogContentText>
          )}
          {dialog.isPrompt && (
            <TextField
              autoFocus
              fullWidth
              variant="standard"
              label={dialog.label}
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              sx={{
                '& label': { color: 'var(--subtext0)' },
                '& input': { color: 'var(--text)' },
                '& .MuiInput-underline:after': { borderBottomColor: 'var(--accent2)' }
              }}
            />
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button 
            onClick={() => handleCloseDialog(dialog.isPrompt ? null : false)} 
            sx={{ color: 'var(--subtext0)' }}
          >
            Cancel
          </Button>
          <Button 
            onClick={() => handleCloseDialog(dialog.isPrompt ? promptValue : true)}
            variant="contained"
            sx={{ 
              bgcolor: `var(--${dialog.severity})`,
              '&:hover': { opacity: 0.9 }
            }}
          >
            {dialog.isPrompt ? 'Submit' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </ModalContext.Provider>
  );
};

// Custom hook for easy access
export const useModals = () => useContext(ModalContext);
