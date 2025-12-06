import { createContext, useContext, useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { useAuth } from './AuthContext'

const SocketContext = createContext(null)

export const useSocket = () => {
  const context = useContext(SocketContext)
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider')
  }
  return context
}

export const SocketProvider = ({ children }) => {
  const { user } = useAuth()
  const [socket, setSocket] = useState(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (!user) {
      // Disconnect if user logs out
      if (socket) {
        socket.disconnect()
        setSocket(null)
        setIsConnected(false)
      }
      return
    }

    // Connect to Socket.io server
    // Use VITE_API_URL if available, otherwise use localhost for development
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000'
    // Extract base URL without /api suffix for Socket.io
    const socketUrl = apiUrl.replace('/api', '')
    
    const newSocket = io(socketUrl, {
      transports: ['polling', 'websocket'], // Try polling first, then websocket
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
      timeout: 20000,
      forceNew: false
    })

    newSocket.on('connect', () => {
      console.log('Socket connected:', newSocket.id, 'Transport:', newSocket.io.engine.transport.name)
      setIsConnected(true)
    })

    newSocket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason)
      setIsConnected(false)
    })

    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message)
      // Don't show error to user, Socket.io will auto-retry
      setIsConnected(false)
    })

    newSocket.on('reconnect', (attemptNumber) => {
      console.log('Socket reconnected after', attemptNumber, 'attempts')
      setIsConnected(true)
    })

    newSocket.on('reconnect_error', (error) => {
      console.error('Socket reconnection error:', error.message)
    })

    newSocket.on('reconnect_failed', () => {
      console.error('Socket reconnection failed')
      setIsConnected(false)
    })

    setSocket(newSocket)

    // Cleanup on unmount
    return () => {
      newSocket.close()
    }
  }, [user])

  const value = {
    socket,
    isConnected
  }

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  )
}

