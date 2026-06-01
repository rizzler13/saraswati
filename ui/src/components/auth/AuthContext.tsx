/**
 * Auth context for Saraswati.
 * Provides user state, login/logout, and paper history tracking.
 */
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { auth, db, isConfigured } from '../../lib/firebase'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  type User,
} from 'firebase/auth'
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
} from 'firebase/firestore'

interface ViewedPaper {
  id: string
  title: string
  viewedAt: number
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  agent?: string
  timestamp: number
}

export interface ChatSession {
  paperId: string
  paperTitle: string
  messages: ChatMessage[]
  updatedAt: number
  attachedPaper?: any | null
}

export interface DeepDiveRecord {
  paperId: string
  paperTitle: string
  updatedAt: number
}

interface AuthState {
  user: User | null
  loading: boolean
  configured: boolean
  viewedPapers: ViewedPaper[]
  chats: ChatSession[]
  deepDives: DeepDiveRecord[]
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string) => Promise<void>
  loginWithGoogle: () => Promise<void>
  logout: () => Promise<void>
  trackPaperView: (id: string, title: string) => void
  saveChatMessage: (paperId: string, paperTitle: string, messages: ChatMessage[], attachedPaper?: any | null) => Promise<void>
  saveDeepDiveRecord: (paperId: string, paperTitle: string) => Promise<void>
  saveAttachedPaper: (paperId: string, attachedPaper: any | null) => Promise<void>
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  configured: false,
  viewedPapers: [],
  chats: [],
  deepDives: [],
  login: async () => {},
  signup: async () => {},
  loginWithGoogle: async () => {},
  logout: async () => {},
  trackPaperView: () => {},
  saveChatMessage: async () => {},
  saveDeepDiveRecord: async () => {},
  saveAttachedPaper: async () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewedPapers, setViewedPapers] = useState<ViewedPaper[]>([])
  const [chats, setChats] = useState<ChatSession[]>([])
  const [deepDives, setDeepDives] = useState<DeepDiveRecord[]>([])
  const configured = isConfigured()

  // Listen to auth state
  useEffect(() => {
    if (!configured || !auth) {
      setLoading(false)
      return
    }
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (u && db) {
        // Load user data from Firestore
        try {
          const docRef = doc(db, 'users', u.uid)
          const snap = await getDoc(docRef)
          if (snap.exists()) {
            const data = snap.data()
            setViewedPapers(data?.viewedPapers || [])
            setChats(data?.chats || [])
            setDeepDives(data?.deepDives || [])
          } else {
            // Create user doc
            await setDoc(docRef, {
              email: u.email,
              createdAt: serverTimestamp(),
              viewedPapers: [],
              chats: [],
              deepDives: []
            })
          }
        } catch (e) {
          console.warn('Failed to load user data:', e)
        }
      } else {
        setViewedPapers([])
        setChats([])
        setDeepDives([])
      }
      setLoading(false)
    })
    return unsub
  }, [configured])

  const login = async (email: string, password: string) => {
    if (!auth) throw new Error('Firebase not configured')
    await signInWithEmailAndPassword(auth, email, password)
  }

  const signup = async (email: string, password: string) => {
    if (!auth) throw new Error('Firebase not configured')
    await createUserWithEmailAndPassword(auth, email, password)
  }

  const loginWithGoogle = async () => {
    if (!auth) throw new Error('Firebase not configured')
    const provider = new GoogleAuthProvider()
    await signInWithPopup(auth, provider)
  }

  const logout = async () => {
    if (!auth) return
    await signOut(auth)
  }

  const trackPaperView = (id: string, title: string) => {
    const entry: ViewedPaper = { id, title, viewedAt: Date.now() }
    setViewedPapers(prev => {
      const filtered = prev.filter(p => p.id !== id)
      return [entry, ...filtered].slice(0, 50)
    })

    // Persist to Firestore
    if (user && db) {
      const docRef = doc(db, 'users', user.uid)
      updateDoc(docRef, {
        viewedPapers: arrayUnion(entry),
      }).catch(e => console.warn('Failed to track paper:', e))
    }
  }

  const saveChatMessage = async (paperId: string, paperTitle: string, updatedMessages: ChatMessage[], attachedPaper?: any | null) => {
    if (!user || !db) return
    const docRef = doc(db, 'users', user.uid)
    try {
      const snap = await getDoc(docRef)
      const currentChats: ChatSession[] = snap.exists() ? (snap.data()?.chats || []) : []
      const filtered = currentChats.filter(c => c.paperId !== paperId)
      const existing = currentChats.find(c => c.paperId === paperId)
      
      const updatedChat: ChatSession = {
        paperId,
        paperTitle,
        messages: updatedMessages,
        attachedPaper: attachedPaper !== undefined ? attachedPaper : (existing?.attachedPaper || null),
        updatedAt: Date.now()
      }
      const newChats = [updatedChat, ...filtered]
      setChats(newChats)
      await updateDoc(docRef, { chats: newChats })
    } catch (e) {
      console.warn('Failed to save chat message:', e)
    }
  }

  const saveDeepDiveRecord = async (paperId: string, paperTitle: string) => {
    if (!user || !db) return
    const docRef = doc(db, 'users', user.uid)
    try {
      const snap = await getDoc(docRef)
      const currentDives: DeepDiveRecord[] = snap.exists() ? (snap.data()?.deepDives || []) : []
      const filtered = currentDives.filter(d => d.paperId !== paperId)
      
      const updatedDive: DeepDiveRecord = {
        paperId,
        paperTitle,
        updatedAt: Date.now()
      }
      const newDives = [updatedDive, ...filtered]
      setDeepDives(newDives)
      await updateDoc(docRef, { deepDives: newDives })
    } catch (e) {
      console.warn('Failed to save deep dive record:', e)
    }
  }

  const saveAttachedPaper = async (paperId: string, attachedPaper: any | null) => {
    if (!user || !db) return
    const docRef = doc(db, 'users', user.uid)
    try {
      const snap = await getDoc(docRef)
      const currentChats: ChatSession[] = snap.exists() ? (snap.data()?.chats || []) : []
      const filtered = currentChats.filter(c => c.paperId !== paperId)
      const existing = currentChats.find(c => c.paperId === paperId)
      
      const updatedChat: ChatSession = {
        paperId,
        paperTitle: existing?.paperTitle || (paperId === 'global' ? 'Global Session' : 'Untitled Chat'),
        messages: existing?.messages || [],
        attachedPaper,
        updatedAt: Date.now()
      }
      const newChats = [updatedChat, ...filtered]
      setChats(newChats)
      await updateDoc(docRef, { chats: newChats })
    } catch (e) {
      console.warn('Failed to save attached paper:', e)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        configured,
        viewedPapers,
        chats,
        deepDives,
        login,
        signup,
        loginWithGoogle,
        logout,
        trackPaperView,
        saveChatMessage,
        saveDeepDiveRecord,
        saveAttachedPaper
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}