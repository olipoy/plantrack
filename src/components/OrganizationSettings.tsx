import React, { useState, useEffect } from 'react';
import { ArrowLeft, Users, Mail, Copy, Check, AlertCircle, UserPlus, Shield, Trash2 } from 'lucide-react';
import { getOrganizationMembers, createOrganizationInvite, getUserOrganizations, removeUserFromOrganization } from '../utils/api';
import { getUser } from '../utils/auth';
import { Organization, OrganizationMember } from '../types';

interface OrganizationSettingsProps {
  onBack: () => void;
}

export const OrganizationSettings: React.FC<OrganizationSettingsProps> = ({ onBack }) => {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [error, setError] = useState('');
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState<string | null>(null);

  const currentUser = getUser();
  const isAdmin = organization?.role === 'admin';

  useEffect(() => {
    loadOrganizationData();
  }, []);

  const loadOrganizationData = async () => {
    try {
      setIsLoading(true);
      
      // Get user's organizations (should be just one for now)
      const organizations = await getUserOrganizations();
      if (organizations.length > 0) {
        setOrganization(organizations[0]);
        
        // Load members
        const membersData = await getOrganizationMembers(organizations[0].id);
        setMembers(membersData);
      }
    } catch (error) {
      console.error('Failed to load organization data:', error);
      setError('Kunde inte ladda organisationsdata');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inviteEmail.trim() || !organization) return;
    
    setIsInviting(true);
    setError('');
    
    try {
      const result = await createOrganizationInvite(organization.id, inviteEmail.trim());
      
      setInviteSuccess(`Inbjudan skickad! Dela denna länk: ${result.inviteUrl}`);
      setInviteEmail('');
      setShowInviteForm(false);
      
      // Auto-clear success message after 10 seconds
      setTimeout(() => setInviteSuccess(''), 10000);
      
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Kunde inte skicka inbjudan');
    } finally {
      setIsInviting(false);
    }
  };

  const copyInviteLink = async () => {
    if (inviteSuccess) {
      const linkMatch = inviteSuccess.match(/https?:\/\/[^\s]+/);
      if (linkMatch) {
        try {
          await navigator.clipboard.writeText(linkMatch[0]);
          setCopiedInvite(true);
          setTimeout(() => setCopiedInvite(false), 2000);
        } catch (error) {
          console.error('Failed to copy link:', error);
        }
      }
    }
  };

  const handleRemoveUser = async (userId: string) => {
    if (!organization) return;
    
    setRemovingUserId(userId);
    setError('');
    
    try {
      await removeUserFromOrganization(organization.id, userId);
      
      // Refresh members list
      const updatedMembers = await getOrganizationMembers(organization.id);
      setMembers(updatedMembers);
      
      setShowRemoveConfirm(null);
    } catch (error) {
      console.error('Failed to remove user:', error);
      setError(error instanceof Error ? error.message : 'Kunde inte ta bort användare');
    } finally {
      setRemovingUserId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Laddar organisationsdata...</p>
        </div>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="h-full bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Ingen organisation hittad</h3>
          <p className="text-gray-500 mb-4">Du verkar inte tillhöra någon organisation.</p>
          <button
            onClick={onBack}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Tillbaka
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-6">
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Organisationsinställningar</h1>
          <div className="w-10" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-6">
          {/* Organization Info */}
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Organisation</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Namn</label>
                <p className="text-gray-900 font-medium">{organization.name}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Din roll</label>
                <div className="flex items-center">
                  {isAdmin ? (
                    <>
                      <Shield className="w-4 h-4 text-blue-600 mr-2" />
                      <span className="text-blue-600 font-medium">Administratör</span>
                    </>
                  ) : (
                    <>
                      <Users className="w-4 h-4 text-gray-600 mr-2" />
                      <span className="text-gray-600">Medlem</span>
                    </>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Medlem sedan</label>
                <p className="text-gray-600">
                  {new Date(organization.joined_at).toLocaleDateString('sv-SE')}
                </p>
              </div>
            </div>
          </div>

          {/* Success Message */}
          {inviteSuccess && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start">
                <Check className="w-5 h-5 text-green-600 mr-2 mt-0.5" />
                <div className="flex-1">
                  <p className="text-green-800 text-sm">{inviteSuccess}</p>
                  <button
                    onClick={copyInviteLink}
                    className="mt-2 flex items-center text-green-700 hover:text-green-800 text-sm font-medium"
                  >
                    {copiedInvite ? (
                      <>
                        <Check className="w-4 h-4 mr-1" />
                        Kopierad!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-1" />
                        Kopiera länk
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center">
                <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            </div>
          )}

          {/* Members Section */}
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Medlemmar ({members.length})</h2>
              {isAdmin && (
                <button
                  onClick={() => setShowInviteForm(!showInviteForm)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center text-sm"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Bjud in
                </button>
              )}
            </div>

            {/* Invite Form */}
            {showInviteForm && isAdmin && (
              <form onSubmit={handleInviteUser} className="mb-6 p-4 bg-gray-50 rounded-lg">
                <div className="space-y-4">
                  <div>
                    <label htmlFor="inviteEmail" className="block text-sm font-medium text-gray-700 mb-2">
                      E-postadress
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="email"
                        id="inviteEmail"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="person@email.se"
                        required
                        disabled={isInviting}
                      />
                    </div>
                  </div>
                  <div className="flex space-x-3">
                    <button
                      type="button"
                      onClick={() => {
                        setShowInviteForm(false);
                        setInviteEmail('');
                        setError('');
                      }}
                      disabled={isInviting}
                      className="flex-1 px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50"
                    >
                      Avbryt
                    </button>
                    <button
                      type="submit"
                      disabled={!inviteEmail.trim() || isInviting}
                      className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                    >
                      {isInviting ? 'Skickar...' : 'Skicka inbjudan'}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Members List */}
            <div className="space-y-3">
              {members.map((member) => (
                <div key={member.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                  <div className="flex items-center">
                    <div className="w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center mr-3 text-white text-sm font-medium">
                      {member.name.split(' ').map(n => n.charAt(0).toUpperCase()).slice(0, 2).join('')}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {member.name}
                        {member.id === currentUser?.id && (
                          <span className="text-blue-600 text-sm ml-2">(Du)</span>
                        )}
                      </p>
                      <p className="text-sm text-gray-500">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    {member.role === 'admin' ? (
                      <div className="flex items-center text-blue-600">
                        <Shield className="w-4 h-4 mr-1" />
                        <span className="text-sm font-medium">Admin</span>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-500">Medlem</span>
                    )}
                    
                    {/* Remove user button - only show for admins and not for current user */}
                    {isAdmin && member.id !== currentUser?.id && (
                      <button
                        onClick={() => setShowRemoveConfirm(member.id)}
                        disabled={removingUserId === member.id}
                        className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Ta bort användare"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      {/* Remove User Confirmation Modal */}
      {showRemoveConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Ta bort användare</h3>
            <p className="text-gray-600 mb-6">
              Är du säker på att du vill ta bort denna användare från organisationen? 
              Användaren kommer inte längre kunna logga in, men deras projekt och anteckningar kommer att bevaras.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowRemoveConfirm(null)}
                disabled={removingUserId !== null}
                className="flex-1 px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50"
              >
                Avbryt
              </button>
              <button
                onClick={() => handleRemoveUser(showRemoveConfirm)}
                disabled={removingUserId !== null}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:bg-gray-300 flex items-center justify-center"
              >
                {removingUserId === showRemoveConfirm ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  'Ta bort'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};