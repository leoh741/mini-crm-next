import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from './mongo';
import User from '../models/User';
import { getCurrentUserId } from './auth';

export async function requireRedesUser(request) {
  await connectDB();
  const userId = await getCurrentUserId(request);
  if (!userId) {
    return {
      error: NextResponse.json(
        { success: false, error: 'Usuario no autenticado' },
        { status: 401 }
      )
    };
  }

  let user = null;
  if (mongoose.Types.ObjectId.isValid(userId)) {
    user = await User.findById(userId).lean();
  }
  if (!user) {
    user = await User.findOne({ crmId: userId }).lean();
  }
  if (!user) {
    return {
      error: NextResponse.json(
        { success: false, error: 'Usuario no encontrado' },
        { status: 404 }
      )
    };
  }

  const rol = user.rol || 'usuario';
  if (rol !== 'admin' && rol !== 'cm') {
    return {
      error: NextResponse.json(
        { success: false, error: 'No tenés acceso a RRSS' },
        { status: 403 }
      )
    };
  }

  return { user, rol };
}

export function normalizarDrive(valor) {
  const texto = String(valor || '').trim();
  if (!texto) return { error: 'El Drive del cliente es requerido' };
  const href = /^https?:\/\//i.test(texto) ? texto : `https://${texto}`;
  try {
    const url = new URL(href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { error: 'El Drive tiene que ser un link válido' };
    }
    return { url: url.toString() };
  } catch {
    return { error: 'El Drive tiene que ser un link válido' };
  }
}

export function puedeSerResponsable(rol) {
  return rol === 'admin' || rol === 'cm';
}

export function filtroOwner(user, ownerIdPedido) {
  if (user.rol === 'admin' && ownerIdPedido && mongoose.Types.ObjectId.isValid(ownerIdPedido)) {
    return new mongoose.Types.ObjectId(ownerIdPedido);
  }
  if (user.rol === 'admin') return null;
  return user._id;
}
