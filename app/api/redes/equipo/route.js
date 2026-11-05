import { NextResponse } from 'next/server';
import User from '../../../../models/User';
import { requireRedesUser } from '../../../../lib/redesAccess';

export async function GET(request) {
  try {
    const acceso = await requireRedesUser(request);
    if (acceso.error) return acceso.error;
    if (acceso.rol !== 'admin') {
      return NextResponse.json({ success: false, error: 'Solo un admin puede ver el equipo de redes' }, { status: 403 });
    }

    const usuarios = await User.find({ rol: { $in: ['cm', 'admin'] } })
      .select('nombre email rol')
      .sort({ nombre: 1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: usuarios.map((usuario) => ({
        id: usuario._id.toString(),
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol
      }))
    });
  } catch (error) {
    console.error('[RRSS equipo GET]', error);
    return NextResponse.json({ success: false, error: 'Error al cargar el equipo de redes' }, { status: 500 });
  }
}
