import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const STORAGE_KEY = 'customer_portal_user';

export interface CustomerPortalUser {
  id: string;
  name: string;
  phone: string;
  address?: string;
  beat_id?: string;
  territory_id?: string;
  distributor_id?: string;
  owner_id?: string;
}

export const useCustomerPortalAuth = () => {
  const [retailer, setRetailer] = useState<CustomerPortalUser | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setRetailer(JSON.parse(stored));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setLoading(false);
  }, []);

  const login = useCallback((user: CustomerPortalUser) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    setRetailer(user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setRetailer(null);
    navigate('/customer-portal/login');
  }, [navigate]);

  const requireAuth = useCallback(() => {
    if (!loading && !retailer) {
      navigate('/customer-portal/login');
      return false;
    }
    return true;
  }, [loading, retailer, navigate]);

  return { retailer, loading, login, logout, requireAuth };
};
