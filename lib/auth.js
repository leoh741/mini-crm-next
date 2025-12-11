// Helper function to get current user ID from request headers
// This function reads the userId from headers sent by the client
// In the future, this could be enhanced to use JWT tokens or cookies

export async function getCurrentUserId(request) {
  try {
    // Try to get userId from headers (client sends it in X-User-Id header)
    const userId = request.headers.get('X-User-Id');
    
    if (userId) {
      return userId;
    }
    
    // Alternative: try to get from cookies if available
    const cookieHeader = request.headers.get('cookie');
    if (cookieHeader) {
      const cookies = Object.fromEntries(
        cookieHeader.split('; ').map(c => c.split('='))
      );
      if (cookies.userId) {
        return cookies.userId;
      }
    }
    
    return null;
  } catch (error) {
    console.error('[Auth] Error getting user ID:', error);
    return null;
  }
}

// Helper function to get current user role from database
export async function getCurrentUserRole(request) {
  try {
    const userId = await getCurrentUserId(request);
    if (!userId) {
      console.log('[Auth] getCurrentUserRole: No userId found');
      return null;
    }
    
    // Import connectDB to ensure connection
    const { default: connectDB } = await import('../lib/mongo');
    await connectDB();
    
    const User = (await import('../models/User')).default;
    const mongoose = (await import('mongoose')).default;
    
    let user;
    if (mongoose.Types.ObjectId.isValid(userId)) {
      user = await User.findById(userId).lean();
    } else {
      user = await User.findOne({ crmId: userId }).lean();
    }
    
    const role = user ? (user.rol || 'usuario') : null;
    console.log('[Auth] getCurrentUserRole:', { userId, role, foundUser: !!user });
    return role;
  } catch (error) {
    console.error('[Auth] Error getting user role:', error);
    return null;
  }
}
