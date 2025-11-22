"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "../../../components/ProtectedRoute";
import { esAdmin } from "../../../lib/authUtils";
import { getUsuarios, crearUsuario, eliminarUsuario, actualizarUsuario, cambiarPassword } from "../../../lib/usuariosUtils";

function UsuariosAdminContent() {
  const router = useRouter();
  const [usuarios, setUsuarios] = useState([]);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState(null);
  const [formData, setFormData] = useState({
    nombre: "",
    email: "",
    password: "",
    rol: "usuario"
  });
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!esAdmin()) {
      router.push("/");
      return;
    }
    cargarUsuarios();
  }, [router]);

  const cargarUsuarios = async () => {
    try {
      setLoading(true);
      const usuariosData = await getUsuarios();
      setUsuarios(usuariosData || []);
      setError("");
    } catch (err) {
      console.error('Error al cargar usuarios:', err);
      setError('Error al cargar los usuarios. Por favor, recarga la página.');
      setUsuarios([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setExito("");

    try {
      if (usuarioEditando) {
        // Actualizar usuario
        const datosActualizados = {
          nombre: formData.nombre,
          email: formData.email,
          rol: formData.rol
        };
        
        if (formData.password) {
          await cambiarPassword(usuarioEditando.id, formData.password);
        }
        
        await actualizarUsuario(usuarioEditando.id, datosActualizados);
        setExito("Usuario actualizado correctamente");
      } else {
        // Crear nuevo usuario
        if (!formData.password) {
          setError("La contraseña es requerida para nuevos usuarios");
          setLoading(false);
          return;
        }
        await crearUsuario(formData);
        setExito("Usuario creado correctamente");
      }

      setFormData({ nombre: "", email: "", password: "", rol: "usuario" });
      setMostrarFormulario(false);
      setUsuarioEditando(null);
      await cargarUsuarios();
    } catch (err) {
      setError(err.message || "Error al guardar el usuario");
    }
  };

  const handleEditar = (usuario) => {
    setUsuarioEditando(usuario);
    setFormData({
      nombre: usuario.nombre,
      email: usuario.email,
      password: "",
      rol: usuario.rol
    });
    setMostrarFormulario(true);
    setError("");
    setExito("");
  };

  const handleEliminar = async (id, nombre) => {
    if (!confirm(`¿Estás seguro de eliminar al usuario "${nombre}"?`)) {
      return;
    }

    try {
      await eliminarUsuario(id);
      setExito("Usuario eliminado correctamente");
      await cargarUsuarios();
    } catch (err) {
      setError(err.message || "Error al eliminar el usuario");
    }
  };

  const handleCancelar = () => {
    setFormData({ nombre: "", email: "", password: "", rol: "usuario" });
    setMostrarFormulario(false);
    setUsuarioEditando(null);
    setError("");
    setExito("");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-slate-300">Cargando usuarios...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-semibold">Administración de Usuarios</h2>
          <p className="text-xs md:text-sm text-slate-400 mt-1">Gestiona los usuarios del sistema</p>
        </div>
        {!mostrarFormulario && (
          <button
            onClick={() => setMostrarFormulario(true)}
            className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium text-sm"
          >
            + Nuevo Usuario
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
          {error}
        </div>
      )}

      {exito && (
        <div className="p-4 bg-green-900/50 border border-green-700 rounded-lg text-green-200">
          {exito}
        </div>
      )}

      {mostrarFormulario && (
        <div className="p-6 bg-slate-800 rounded-lg border border-slate-700">
          <h3 className="text-xl font-semibold mb-4">
            {usuarioEditando ? "Editar Usuario" : "Nuevo Usuario"}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Nombre</label>
              <input
                type="text"
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                required
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Contraseña {usuarioEditando && "(dejar vacío para no cambiar)"}
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required={!usuarioEditando}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Rol</label>
              <select
                value={formData.rol}
                onChange={(e) => setFormData({ ...formData, rol: e.target.value })}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="usuario">Usuario</option>
                <option value="admin">Administrador</option>
              </select>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium"
              >
                {usuarioEditando ? "Actualizar" : "Crear"}
              </button>
              <button
                type="button"
                onClick={handleCancelar}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-700 rounded-lg font-medium"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Vista de tabla para desktop */}
      <div className="hidden md:block bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-700">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold">Nombre</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Email</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Rol</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Fecha Creación</th>
              <th className="px-4 py-3 text-right text-sm font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((usuario) => (
              <tr key={usuario.id} className="border-t border-slate-700 hover:bg-slate-750">
                <td className="px-4 py-3">{usuario.nombre}</td>
                <td className="px-4 py-3 text-slate-300">{usuario.email}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    usuario.rol === 'admin' 
                      ? 'bg-purple-900/50 text-purple-200' 
                      : 'bg-slate-700 text-slate-300'
                  }`}>
                    {usuario.rol === 'admin' ? 'Administrador' : 'Usuario'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-400">
                  {new Date(usuario.fechaCreacion).toLocaleDateString('es-ES')}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => handleEditar(usuario)}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleEliminar(usuario.id, usuario.nombre)}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
                    >
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {usuarios.length === 0 && (
          <div className="p-8 text-center text-slate-400">
            No hay usuarios registrados
          </div>
        )}
      </div>

      {/* Vista de cards para móvil */}
      <div className="md:hidden space-y-3">
        {usuarios.length === 0 ? (
          <div className="p-8 text-center text-slate-400 bg-slate-800 rounded-lg border border-slate-700">
            No hay usuarios registrados
          </div>
        ) : (
          usuarios.map((usuario) => (
            <div key={usuario.id} className="bg-slate-800 rounded-lg border border-slate-700 p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-base mb-1">{usuario.nombre}</h3>
                  <p className="text-sm text-slate-300 break-words">{usuario.email}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-400 font-medium">Rol:</span>
                <span className={`px-3 py-1.5 rounded text-sm font-medium whitespace-nowrap ${
                  usuario.rol === 'admin' 
                    ? 'bg-purple-900/50 text-purple-200' 
                    : 'bg-slate-700 text-slate-300'
                }`}>
                  {usuario.rol === 'admin' ? 'Administrador' : 'Usuario'}
                </span>
              </div>
              
              <div className="text-xs text-slate-400">
                <span className="font-medium">Fecha Creación: </span>
                {new Date(usuario.fechaCreacion).toLocaleDateString('es-ES')}
              </div>
              
              <div className="flex gap-2 pt-2 border-t border-slate-700">
                <button
                  onClick={() => handleEditar(usuario)}
                  className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleEliminar(usuario.id, usuario.nombre)}
                  className="flex-1 px-3 py-2 bg-red-600 hover:bg-red-700 rounded text-sm font-medium"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function UsuariosAdminPage() {
  return (
    <ProtectedRoute>
      <UsuariosAdminContent />
    </ProtectedRoute>
  );
}

