// Email history utility functions for storing and retrieving recently used email addresses

const EMAIL_HISTORY_KEY = 'inspection_email_history';
const MAX_EMAIL_HISTORY = 5;

export interface EmailHistoryItem {
  email: string;
  lastUsed: number;
}

// Load email history from localStorage
export const loadEmailHistory = (): string[] => {
  try {
    const stored = localStorage.getItem(EMAIL_HISTORY_KEY);
    if (!stored) return [];
    
    const history: EmailHistoryItem[] = JSON.parse(stored);
    
    // Sort by lastUsed (most recent first) and return just the email addresses
    return history
      .sort((a, b) => b.lastUsed - a.lastUsed)
      .map(item => item.email);
  } catch (error) {
    console.error('Failed to load email history:', error);
    return [];
  }
};

// Save email to history
export const saveEmailToHistory = (email: string): void => {
  if (!email || !email.trim()) return;
  
  const trimmedEmail = email.trim().toLowerCase();
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmedEmail)) return;
  
  try {
    const existing = loadEmailHistory();
    const now = Date.now();
    
    // Remove existing entry if present
    const filtered = existing.filter(e => e.toLowerCase() !== trimmedEmail);
    
    // Add new entry at the beginning
    const updated = [trimmedEmail, ...filtered].slice(0, MAX_EMAIL_HISTORY);
    
    // Convert to history items with timestamps
    const historyItems: EmailHistoryItem[] = updated.map((email, index) => ({
      email,
      lastUsed: now - index // Ensure proper ordering
    }));
    
    localStorage.setItem(EMAIL_HISTORY_KEY, JSON.stringify(historyItems));
  } catch (error) {
    console.error('Failed to save email to history:', error);
  }
};

// Filter email history based on input
export const filterEmailHistory = (input: string, history: string[]): string[] => {
  if (!input.trim()) return history;
  
  const searchTerm = input.toLowerCase();
  return history.filter(email => 
    email.toLowerCase().includes(searchTerm)
  );
};