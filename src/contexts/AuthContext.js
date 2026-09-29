import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../utils/apiClient';
import { getClientId } from '../utils/clientId';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');
  const [available, setAvailable] = useState(true);
  const [loginRequest, setLoginRequest] = useState(0);
  const requestLogin = useCallback(() => setLoginRequest((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    api('/api/auth/me')
      .then((data) => {
        if (!cancelled) setUser(data?.user || null);
      })
      .catch((error) => {
        if (cancelled) return;
        setUser(null);
        if (error?.code === 'NETWORK_ERROR' || error?.status === 404 || error?.status === 503) {
          setAvailable(false);
        }
      })
      .finally(() => {
        if (!cancelled) setStatus('ready');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username, password) => {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: { username, password, clientId: getClientId() },
    });
    setUser(data.user);
    setAvailable(true);
    return data.user;
  }, []);

  const register = useCallback(async (username, password, securityQuestionId, securityAnswer) => {
    const data = await api('/api/auth/register', {
      method: 'POST',
      body: {
        username,
        password,
        securityQuestionId,
        securityAnswer,
        clientId: getClientId(),
      },
    });
    setUser(data.user);
    setAvailable(true);
    return data.user;
  }, []);

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    const data = await api('/api/auth/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword },
    });
    setUser(data.user);
    return data.user;
  }, []);

  const requestForgotPassword = useCallback(async (username, securityAnswer, contact) => {
    await api('/api/auth/forgot-password', {
      method: 'POST',
      body: {
        username,
        securityAnswer,
        contactChannel: contact?.channel,
        contactValue: contact?.value,
        clientId: getClientId(),
      },
    });
  }, []);

  const fetchSecurityQuestion = useCallback(async (username) => {
    const data = await api(
      `/api/auth/security-question?username=${encodeURIComponent(username)}`
    );
    return data?.questionId || null;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
    }
  }, []);

  const deleteAccount = useCallback(async () => {
    await api('/api/auth/me', { method: 'DELETE' });
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      status,
      available,
      login,
      register,
      changePassword,
      requestForgotPassword,
      fetchSecurityQuestion,
      logout,
      deleteAccount,
      loginRequest,
      requestLogin,
    }),
    [
      user,
      status,
      available,
      login,
      register,
      changePassword,
      requestForgotPassword,
      fetchSecurityQuestion,
      logout,
      deleteAccount,
      loginRequest,
      requestLogin,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
