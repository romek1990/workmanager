import React from 'react'
import { Navigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'

// Blocks access based on required role
export default function ProtectedRoute({ children, requiredRole }) {
  const { currentUser } = useApp()

  if (!currentUser) {
    return <Navigate to="/login" replace />
  }

  if (requiredRole && currentUser.role !== requiredRole) {
    // Employee trying to access admin page → redirect to their home
    return <Navigate to="/my-home" replace />
  }

  return children
}
