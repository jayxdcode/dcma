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
  const [alert, setAlert] = useState({ open: false, message: '', severity: 'success' });
  
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
    setAlert({ open: true, message, severity });
  }, []);

  // Promise-based Confirm
  const showConfirm = useCallback((title, message) => {
    return new Promise((resolve) => {
      setDialog({
        open: true,
        title,
        message,
        isPrompt: false,
        resolve
      });
    });
  }, []);

  // Promise-based Prompt
  const showPrompt = useCallback((title, label, defaultValue = '') => {
    setPromptValue(defaultValue);
    return new Promise((resolve) => {
      setDialog({
        open: true,
        title,
        label,
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
      backgroundColor: 'var(--surface-2)',
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
        open={alert.open}
        autoHideDuration={4000}
        onClose={() => setAlert({ ...alert, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert 
          variant="filled" 
          severity={alert.severity}
          sx={{ bgcolor: alert.severity === 'success' ? 'var(--accent)' : 'var(--accent-2)' }}
        >
          {alert.message}
        </Alert>
      </Snackbar>

      {/* 2. Global Dialog (Confirm / Prompt) */}
      <Dialog open={dialog.open} PaperProps={sharedPaperStyles}>
        <DialogTitle>{dialog.title}</DialogTitle>
        <DialogContent>
          {dialog.message && (
            <DialogContentText sx={{ color: 'var(--text-secondary)', mb: 2 }}>
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
                '& label': { color: 'var(--text-secondary)' },
                '& input': { color: 'var(--text)' },
                '& .MuiInput-underline:after': { borderBottomColor: 'var(--accent-2)' }
              }}
            />
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button 
            onClick={() => handleCloseDialog(dialog.isPrompt ? null : false)} 
            sx={{ color: 'var(--text-secondary)' }}
          >
            Cancel
          </Button>
          <Button 
            onClick={() => handleCloseDialog(dialog.isPrompt ? promptValue : true)}
            variant="contained"
            sx={{ 
              bgcolor: dialog.isPrompt ? 'var(--accent-2)' : 'var(--accent)',
              '&:hover': { opacity: 0.9, bgcolor: dialog.isPrompt ? 'var(--accent-2)' : 'var(--accent)' }
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