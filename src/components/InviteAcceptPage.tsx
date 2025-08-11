import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ClipboardList, Mail, Lock, User, Eye, EyeOff, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

interface InviteDetails {
  organizationId: string;
  organizationName: string;
  email: string;
  role: string;
}

export const InviteAcceptPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  
  const [inviteDetails, setInviteDetails] = useState<InviteDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form fields
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Ogiltig inbjudningslänk');
      setIsLoading(false);
      return;
    }

    const loadInviteDetails = async () => {
      try {
        const response = await fetch(`/api/invites/${token}`);
        
        if (response.status === 404) {
          setError('Inbjudan hittades inte');
          return;
        }
        
        if (response.status === 410) {
          setError('Inbjudan har redan använts eller har gått ut');
          return;
        }
        
        if (!response.ok) {
          throw new Error('Kunde inte ladda inbjudan');
        }
        
        const details = await response.json();
        setInviteDetails(details);
      } catch (error) {
        console.error('Failed to load invite:', error);
        setError('Kunde inte ladda inbjudan');
      } finally {
        setIsLoading(false);
      }
    };
    
    loadInviteDetails();
  }, [token]);

  const handleAcceptInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim() || !password.trim()) {
      setError('Alla fält är obligatoriska');
      return;
    }

    if (password.length < 6) {
      setError('Lösenordet måste vara minst 6 tecken långt');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`/api/invites/${token}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: name.trim(), password }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Kunde inte acceptera inbjudan');
      }

      const { user, token: authToken } = await response.json();
      
      // Store auth token and user data
      localStorage.setItem('inspection_auth_token', authToken);
      localStorage.setItem('inspection_user', JSON.stringify(user));
      
      // Redirect to main app
      navigate('/');
      
    } catch (error) {
      console.error('Accept invite error:', error);
      setError(error instanceof Error ? error.message : 'Kunde inte acceptera inbjudan');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Laddar inbjudan...</p>
        </div>
      </div>
    );
  }

  if (error && !inviteDetails) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Problem med inbjudan</h1>
            <p className="text-gray-500 mt-2">{error}</p>
          </div>
          
          <div className="text-center">
            <button
              onClick={() => navigate('/login')}
              className="bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors"
            >
              Gå till inloggning
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ClipboardList className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Gå med i organisation</h1>
          <p className="text-gray-500 mt-2">Slutför din registrering</p>
          
          {inviteDetails && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
              <div className="flex items-center mb-2">
                <CheckCircle className="w-5 h-5 text-blue-600 mr-2" />
                <p className="text-blue-800 font-medium">Du har blivit inbjuden!</p>
              </div>
              <p className="text-blue-700 text-sm font-semibold">
                {inviteDetails.organizationName}
              </p>
              <p className="text-blue-600 text-sm">
                Roll: {inviteDetails.role === 'admin' ? 'Administratör' : 'Medlem'}
              </p>
            </div>
          )}
        </div>

        {/* Registration Form */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <form onSubmit={handleAcceptInvite} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                E-post
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  id="email"
                  value={inviteDetails?.email || ''}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl bg-gray-50 text-gray-500"
                  disabled
                />
              </div>
            </div>

            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                Namn
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Ditt namn"
                  required
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Lösenord
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Minst 6 tecken"
                  required
                  minLength={6}
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  disabled={isSubmitting}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">Lösenordet måste vara minst 6 tecken långt</p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="flex items-center">
                  <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={!name.trim() || !password.trim() || isSubmitting}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-xl font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Går med...
                </>
              ) : (
                'Gå med i organisation'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-xs text-gray-500">
              Genom att gå med godkänner du våra användarvillkor
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};