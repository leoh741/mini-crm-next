"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ProtectedRoute from "../../components/ProtectedRoute";
import { esAdmin, getUsuarioActual } from "../../lib/authUtils";

const TIPOS = [
  { id: "reel", label: "Reel" },
  { id: "story", label: "Historia" },
  { id: "post", label: "Post" },
  { id: "carrusel", label: "Carrusel" },
  { id: "otro", label: "Otro" }
];

const PLATAFORMAS = [
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "otra", label: "Otra" }
];

const DIAS_SEMANA = [
  { id: 1, label: "Lun" },
  { id: 2, label: "Mar" },
  { id: 3, label: "Mié" },
  { id: 4, label: "Jue" },
  { id: 5, label: "Vie" },
  { id: 6, label: "Sáb" },
  { id: 0, label: "Dom" }
];

function headersAuth() {
  const user = getUsuarioActual();
  return {
    "Content-Type": "application/json",
    ...(user?.usuarioId ? { "X-User-Id": String(user.usuarioId) } : {})
  };
}

function isoDia(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fechaLocal(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function lunesDe(date) {
  const dia = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  dia.setDate(dia.getDate() - ((dia.getDay() + 6) % 7));
  return dia;
}

function textoHecho(post) {
  if (post.estado !== "hecho") return "";
  const serie = post.repeticion === "dias" || post.repeticion === "fija";
  const marca = serie ? (post.hechas || []).find((item) => item.dia === post.diaOcurrencia) : null;
  const cuandoRaw = marca?.at || post.completedAt;
  const quien = marca?.by?.nombre || post.completedBy?.nombre || "alguien";
  if (!cuandoRaw) return serie ? "Hecho este día" : "";
  const cuando = new Date(cuandoRaw).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
  return `Hecho por ${quien} · ${cuando}`;
}

function ocurreEl(post, iso) {
  const repeticion = post.repeticion || "unica";
  if (repeticion === "fija") {
    if (iso < diaDe(post.fecha)) return false;
    return (post.diasSemana || []).includes(fechaLocal(iso).getDay());
  }
  if (repeticion === "dias") {
    const claves = [diaDe(post.fecha), ...(post.fechas || []).map((fecha) => diaDe(fecha))];
    return claves.includes(iso);
  }
  return diaDe(post.fecha) === iso;
}

function estadoDelDia(post, iso) {
  if (!post.repeticion || post.repeticion === "unica") return post.estado || "programado";
  return (post.hechas || []).some((marca) => marca.dia === iso) ? "hecho" : "programado";
}

function paraElDia(post, iso) {
  return { ...post, diaOcurrencia: iso, estado: estadoDelDia(post, iso) };
}

function textoAgenda(post) {
  if (post.repeticion === "fija") {
    const nombres = DIAS_SEMANA.filter((dia) => (post.diasSemana || []).includes(dia.id)).map((dia) => dia.label);
    return nombres.length ? `Fija · ${nombres.join(", ")}` : "Fija";
  }
  if (post.repeticion === "dias") return `${1 + (post.fechas || []).length} días`;
  return "";
}

function diaDe(valor) {
  const date = new Date(valor);
  return isoDia(date);
}

function etiqueta(lista, id) {
  return lista.find((item) => item.id === id)?.label || id;
}

function redesDe(post) {
  if (Array.isArray(post?.plataformas) && post.plataformas.length) return post.plataformas;
  return [post?.plataforma || "instagram"];
}

function textoRedes(post) {
  return redesDe(post).map((id) => etiqueta(PLATAFORMAS, id)).join(", ");
}

function tiposDe(post) {
  if (Array.isArray(post?.tipos) && post.tipos.length) return post.tipos;
  return [post?.tipo || "post"];
}

function textoTipos(post) {
  const elegidos = new Set(tiposDe(post));
  return TIPOS.filter((tipo) => elegidos.has(tipo.id)).map((tipo) => tipo.label).join(", ");
}

function puedeSerResponsable(rol) {
  return rol === "admin" || rol === "cm";
}

function etiquetaResponsable(persona) {
  const rol = persona.rol === "admin" ? "Administrador" : "Community manager";
  return `${persona.nombre} (${rol})`;
}

function RedesContent() {
  const admin = esAdmin();
  const [vista, setVista] = useState("hoy");
  const [clientes, setClientes] = useState([]);
  const [posts, setPosts] = useState([]);
  const [equipo, setEquipo] = useState([]);
  const [ownerFiltro, setOwnerFiltro] = useState("");
  const [clienteFiltro, setClienteFiltro] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [modoCalendario, setModoCalendario] = useState("mes");
  const [semana, setSemana] = useState(() => lunesDe(new Date()));
  const [editandoPost, setEditandoPost] = useState(null);
  const [mes, setMes] = useState(() => {
    const hoy = new Date();
    return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  });
  const [diaSeleccionado, setDiaSeleccionado] = useState(() => isoDia(new Date()));
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [clienteForm, setClienteForm] = useState({ nombre: "", notas: "", driveUrl: "", ownerId: "" });
  const [editandoCliente, setEditandoCliente] = useState(null);
  const [postForm, setPostForm] = useState({
    clienteId: "",
    tipos: ["post"],
    plataformas: ["instagram"],
    fecha: isoDia(new Date()),
    repeticion: "unica",
    diasSemana: [],
    fechas: [],
    hora: "09:00",
    titulo: "",
    copy: "",
    linkMaterial: ""
  });

  const cargarClientes = useCallback(async () => {
    const params = new URLSearchParams();
    if (admin && ownerFiltro) params.set("ownerId", ownerFiltro);
    const res = await fetch(`/api/redes/clientes?${params}`, { headers: headersAuth(), cache: "no-store" });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || "No se pudieron cargar los clientes");
    setClientes(data.data || []);
  }, [admin, ownerFiltro]);

  const cargarPosts = useCallback(async () => {
    const params = new URLSearchParams();
    if (admin && ownerFiltro) params.set("ownerId", ownerFiltro);
    if (clienteFiltro) params.set("clienteId", clienteFiltro);
    if (estadoFiltro) params.set("estado", estadoFiltro);
    const hoy = new Date();
    let rangoDesde;
    let rangoHasta;
    if (vista === "hoy") {
      rangoDesde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0, 0);
      rangoHasta = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59, 999);
    } else if (modoCalendario === "semana") {
      const inicio = lunesDe(semana);
      const fin = new Date(inicio);
      fin.setDate(inicio.getDate() + 6);
      rangoDesde = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate(), 0, 0, 0, 0);
      rangoHasta = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate(), 23, 59, 59, 999);
    } else {
      rangoDesde = new Date(mes.getFullYear(), mes.getMonth(), 1, 0, 0, 0, 0);
      rangoHasta = new Date(mes.getFullYear(), mes.getMonth() + 1, 0, 23, 59, 59, 999);
    }
    params.set("desde", rangoDesde.toISOString());
    params.set("hasta", rangoHasta.toISOString());
    const res = await fetch(`/api/redes/publicaciones?${params}`, { headers: headersAuth(), cache: "no-store" });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || "No se pudieron cargar las publicaciones");
    setPosts(data.data || []);
  }, [admin, ownerFiltro, clienteFiltro, estadoFiltro, mes, semana, modoCalendario, vista]);

  useEffect(() => {
    if (!admin) return;
    fetch("/api/redes/equipo", { headers: headersAuth(), cache: "no-store" })
      .then((res) => res.json())
      .then((data) => { if (data.success) setEquipo(data.data || []); })
      .catch(() => {});
  }, [admin]);

  useEffect(() => {
    cargarClientes().catch((err) => setError(err.message));
  }, [cargarClientes]);

  useEffect(() => {
    cargarPosts().catch((err) => setError(err.message));
  }, [cargarPosts]);

  const guardarCliente = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setError("");
    try {
      const payload = {
        nombre: clienteForm.nombre,
        notas: clienteForm.notas,
        driveUrl: clienteForm.driveUrl,
        ownerId: clienteForm.ownerId
      };
      const url = editandoCliente ? `/api/redes/clientes/${editandoCliente}` : "/api/redes/clientes";
      const res = await fetch(url, {
        method: editandoCliente ? "PATCH" : "POST",
        headers: headersAuth(),
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo guardar");
      setClienteForm({ nombre: "", notas: "", driveUrl: "", ownerId: "" });
      setEditandoCliente(null);
      await cargarClientes();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const borrarCliente = async (id) => {
    if (!window.confirm("Se elimina el cliente y sus publicaciones. ¿Seguís?")) return;
    const res = await fetch(`/api/redes/clientes/${id}`, { method: "DELETE", headers: headersAuth() });
    const data = await res.json();
    if (!res.ok || !data.success) {
      setError(data.error || "No se pudo eliminar");
      return;
    }
    if (clienteFiltro === id) setClienteFiltro("");
    await cargarClientes();
    await cargarPosts();
  };

  const guardarPost = async (e) => {
    e.preventDefault();
    if (!postForm.tipos.length) {
      setError("Elegí al menos un formato");
      return;
    }
    if (!postForm.plataformas.length) {
      setError("Elegí al menos una red");
      return;
    }
    if (postForm.repeticion === "fija" && postForm.diasSemana.length === 0) {
      setError("Elegí al menos un día de la semana");
      return;
    }
    if (postForm.repeticion === "dias" && postForm.fechas.length === 0) {
      setError("Sumá al menos otro día");
      return;
    }
    setGuardando(true);
    setError("");
    try {
      const res = await fetch(editandoPost ? `/api/redes/publicaciones/${editandoPost}` : "/api/redes/publicaciones", {
        method: editandoPost ? "PATCH" : "POST",
        headers: headersAuth(),
        body: JSON.stringify({
          ...postForm,
          fecha: fechaLocal(postForm.fecha).toISOString(),
          repeticion: postForm.repeticion,
          diasSemana: postForm.repeticion === "fija" ? postForm.diasSemana : [],
          fechas: postForm.repeticion === "dias" ? postForm.fechas.map((iso) => fechaLocal(iso).toISOString()) : []
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo guardar la publicación");
      setEditandoPost(null);
      setPostForm((prev) => ({ ...prev, titulo: "", copy: "", linkMaterial: "" }));
      await cargarPosts();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const marcar = async (post, estado) => {
    const res = await fetch(`/api/redes/publicaciones/${post.id}`, {
      method: "PATCH",
      headers: headersAuth(),
      body: JSON.stringify({
        estado,
        ...(post.repeticion && post.repeticion !== "unica" ? { dia: post.diaOcurrencia } : {})
      })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      setError(data.error || "No se pudo actualizar");
      return;
    }
    setPosts((prev) => prev.map((item) => (item.id === post.id ? data.data : item)));
  };

  const editarPost = (post) => {
    const fecha = new Date(post.fecha);
    setEditandoPost(post.id);
    setVista("calendario");
    setDiaSeleccionado(diaDe(post.fecha));
    setMes(new Date(fecha.getFullYear(), fecha.getMonth(), 1));
    setSemana(lunesDe(fecha));
    setPostForm({
      clienteId: post.cliente?.id || "",
      tipos: tiposDe(post),
      plataformas: redesDe(post),
      fecha: diaDe(post.fecha),
      repeticion: post.repeticion === "dias" || post.repeticion === "fija" ? post.repeticion : "unica",
      diasSemana: post.diasSemana || [],
      fechas: (post.fechas || []).map((fecha) => diaDe(fecha)).filter((iso) => iso !== diaDe(post.fecha)),
      hora: post.hora || "09:00",
      titulo: post.titulo || "",
      copy: post.copy || "",
      linkMaterial: post.linkMaterial || ""
    });
  };

  const cancelarPost = () => {
    setEditandoPost(null);
    setPostForm((prev) => ({ ...prev, titulo: "", copy: "", linkMaterial: "" }));
  };

  const borrarPost = async (post) => {
    const serie = post.repeticion === "fija" || post.repeticion === "dias";
    if (!window.confirm(serie ? "Se elimina esta publicación de todos los días. ¿Seguís?" : "¿Eliminar esta publicación?")) return;
    const id = post.id;
    const res = await fetch(`/api/redes/publicaciones/${id}`, { method: "DELETE", headers: headersAuth() });
    const data = await res.json();
    if (!res.ok || !data.success) {
      setError(data.error || "No se pudo eliminar");
      return;
    }
    if (editandoPost === id) cancelarPost();
    setPosts((prev) => prev.filter((item) => item.id !== id));
  };

  const diasMes = useMemo(() => {
    const inicio = new Date(mes.getFullYear(), mes.getMonth(), 1);
    const fin = new Date(mes.getFullYear(), mes.getMonth() + 1, 0);
    const celdas = [];
    for (let i = 0; i < (inicio.getDay() + 6) % 7; i += 1) celdas.push(null);
    for (let dia = 1; dia <= fin.getDate(); dia += 1) {
      celdas.push(new Date(mes.getFullYear(), mes.getMonth(), dia));
    }
    return celdas;
  }, [mes]);

  const postsPorDia = useMemo(() => {
    const mapa = {};
    const dias = modoCalendario === "semana"
      ? Array.from({ length: 7 }, (_, i) => {
        const inicio = lunesDe(semana);
        const dia = new Date(inicio);
        dia.setDate(inicio.getDate() + i);
        return dia;
      })
      : Array.from({ length: new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate() }, (_, i) => new Date(mes.getFullYear(), mes.getMonth(), i + 1));
    dias.forEach((dia) => {
      const clave = isoDia(dia);
      mapa[clave] = posts
        .filter((post) => ocurreEl(post, clave))
        .map((post) => paraElDia(post, clave))
        .filter((post) => !estadoFiltro || post.estado === estadoFiltro);
    });
    return mapa;
  }, [posts, mes, semana, modoCalendario, estadoFiltro]);

  const diasSemana = useMemo(() => {
    const inicio = lunesDe(semana);
    return Array.from({ length: 7 }, (_, i) => {
      const dia = new Date(inicio);
      dia.setDate(inicio.getDate() + i);
      return dia;
    });
  }, [semana]);
  const postsDelDia = postsPorDia[diaSeleccionado] || [];
  const hoyIso = isoDia(new Date());
  const postsHoy = posts
    .filter((post) => ocurreEl(post, hoyIso))
    .map((post) => paraElDia(post, hoyIso))
    .filter((post) => !estadoFiltro || post.estado === estadoFiltro);
  const clienteElegido = clientes.find((cliente) => cliente.id === postForm.clienteId);
  const responsables = equipo
    .filter((persona) => puedeSerResponsable(persona.rol))
    .sort((a, b) => (a.rol === b.rol ? a.nombre.localeCompare(b.nombre, "es") : a.rol === "cm" ? -1 : 1));
  const tituloMes = mes.toLocaleDateString("es-AR", { month: "long", year: "numeric" }).replace(/^./, (letra) => letra.toUpperCase());
  const tituloSemana = `${diasSemana[0].toLocaleDateString("es-AR", { day: "numeric", month: "short" })} – ${diasSemana[6].toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">RRSS</h1>
          <p className="text-xs text-slate-400">Calendario de publicaciones del equipo de redes</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            ["hoy", "Hoy"],
            ["calendario", "Calendario"],
            ["clientes", "Clientes"]
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setVista(id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${vista === id ? "bg-fuchsia-600 text-white" : "bg-slate-800 text-slate-300"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {admin && (
        <label className="flex w-full max-w-xs flex-col gap-1 text-xs text-slate-400">
          <span>Ver cartera de</span>
          <select
            value={ownerFiltro}
            onChange={(e) => setOwnerFiltro(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
          >
            <option value="">Todos</option>
            {equipo.map((persona) => (
              <option key={persona.id} value={persona.id}>{persona.nombre} ({persona.rol})</option>
            ))}
          </select>
        </label>
      )}

      {error && <div className="rounded-md border border-red-700 bg-red-900/40 px-3 py-2 text-sm text-red-200">{error}</div>}

      {vista === "hoy" && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-slate-300">Publicaciones de hoy</p>
            <select
              value={estadoFiltro}
              onChange={(e) => setEstadoFiltro(e.target.value)}
              className="min-h-9 min-w-[10.5rem] flex-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-sm sm:min-h-0 sm:flex-none sm:text-xs"
            >
              <option value="">Todos los estados</option>
              <option value="programado">Programado</option>
              <option value="hecho">Hecho</option>
            </select>
          </div>
          {postsHoy.length === 0 && <p className="text-sm text-slate-500">No hay publicaciones para este filtro.</p>}
          {postsHoy.map((post) => (
            <FilaPost key={post.id} post={post} onMarcar={marcar} onBorrar={borrarPost} onEditar={editarPost} />
          ))}
        </div>
      )}

      {vista === "clientes" && (
        <div className="space-y-3">
          {admin && (
            <form onSubmit={guardarCliente} className="grid gap-2 rounded-md border border-slate-700 p-3 sm:grid-cols-2">
              <input
                value={clienteForm.nombre}
                onChange={(e) => setClienteForm({ ...clienteForm, nombre: e.target.value })}
                placeholder="Nombre del cliente"
                className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm"
                required
              />
              <input
                value={clienteForm.notas}
                onChange={(e) => setClienteForm({ ...clienteForm, notas: e.target.value })}
                placeholder="Notas"
                className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm"
              />
              <input
                type="url"
                value={clienteForm.driveUrl}
                onChange={(e) => setClienteForm({ ...clienteForm, driveUrl: e.target.value })}
                placeholder="Drive general del cliente"
                className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm sm:col-span-2"
                required
              />
              <select
                value={clienteForm.ownerId}
                onChange={(e) => setClienteForm({ ...clienteForm, ownerId: e.target.value })}
                className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm sm:col-span-2"
                required
              >
                <option value="">Responsable</option>
                {responsables.map((persona) => (
                  <option key={persona.id} value={persona.id}>{etiquetaResponsable(persona)}</option>
                ))}
              </select>
              <div className="flex gap-2 sm:col-span-2">
                <button type="submit" disabled={guardando} className="rounded-md bg-fuchsia-600 px-3 py-1.5 text-xs font-medium disabled:opacity-50">
                  {editandoCliente ? "Guardar cliente" : "Agregar cliente"}
                </button>
                {editandoCliente && (
                  <button
                    type="button"
                    onClick={() => { setEditandoCliente(null); setClienteForm({ nombre: "", notas: "", driveUrl: "", ownerId: "" }); }}
                    className="rounded-md bg-slate-700 px-3 py-1.5 text-xs"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          )}
          <div className="space-y-1">
            {clientes.map((cliente) => (
              <div key={cliente.id} className="flex flex-col gap-2 rounded-md border border-slate-700 px-3 py-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => { setClienteFiltro(cliente.id); setVista("calendario"); }}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="break-words text-sm font-medium">{cliente.nombre}</p>
                  <p className="break-words text-xs text-slate-400">
                    {cliente.owner?.nombre || "Sin responsable"}{cliente.notas ? ` · ${cliente.notas}` : ""}
                  </p>
                </button>
                <div className="flex flex-wrap gap-2">
                {cliente.driveUrl && (
                  <a href={cliente.driveUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center text-sm text-fuchsia-300 sm:min-h-0 sm:text-xs">Drive</a>
                )}
                {admin && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setEditandoCliente(cliente.id);
                        setClienteForm({
                          nombre: cliente.nombre,
                          notas: cliente.notas || "",
                          driveUrl: cliente.driveUrl || "",
                          ownerId: responsables.some((persona) => persona.id === cliente.owner?.id) ? cliente.owner.id : ""
                        });
                      }}
                      className="min-h-9 rounded-md px-2.5 text-sm text-slate-300 sm:min-h-0 sm:px-0 sm:text-xs"
                    >
                      Editar
                    </button>
                    <button type="button" onClick={() => borrarCliente(cliente.id)} className="min-h-9 rounded-md px-2.5 text-sm text-red-300 sm:min-h-0 sm:px-0 sm:text-xs">Eliminar</button>
                  </>
                )}
                </div>
              </div>
            ))}
            {clientes.length === 0 && (
              <p className="text-sm text-slate-500">
                {admin ? "Todavía no hay clientes de redes." : "No tenés clientes asignados."}
              </p>
            )}
          </div>
        </div>
      )}

      {vista === "calendario" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setModoCalendario("mes")}
              className={`rounded-md px-2 py-1 text-xs ${modoCalendario === "mes" ? "bg-fuchsia-600 text-white" : "bg-slate-800 text-slate-300"}`}
            >
              Mes
            </button>
            <button
              type="button"
              onClick={() => { setModoCalendario("semana"); setSemana(lunesDe(fechaLocal(diaSeleccionado))); }}
              className={`rounded-md px-2 py-1 text-xs ${modoCalendario === "semana" ? "bg-fuchsia-600 text-white" : "bg-slate-800 text-slate-300"}`}
            >
              Semana
            </button>
            <button
              type="button"
              onClick={() => {
                if (modoCalendario === "semana") {
                  const anterior = lunesDe(semana);
                  anterior.setDate(anterior.getDate() - 7);
                  setSemana(anterior);
                } else {
                  setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1));
                }
              }}
              className="rounded-md bg-slate-800 px-2 py-1 text-xs"
            >
              ←
            </button>
            <p className="min-w-32 text-sm">{modoCalendario === "semana" ? tituloSemana : tituloMes}</p>
            <button
              type="button"
              onClick={() => {
                if (modoCalendario === "semana") {
                  const siguiente = lunesDe(semana);
                  siguiente.setDate(siguiente.getDate() + 7);
                  setSemana(siguiente);
                } else {
                  setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1));
                }
              }}
              className="rounded-md bg-slate-800 px-2 py-1 text-xs"
            >
              →
            </button>
            <select
              value={clienteFiltro}
              onChange={(e) => setClienteFiltro(e.target.value)}
              className="min-h-9 min-w-[10.5rem] flex-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-sm sm:min-h-0 sm:flex-none sm:text-xs"
            >
              <option value="">Todos los clientes</option>
              {clientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>{cliente.nombre}</option>
              ))}
            </select>
            <select
              value={estadoFiltro}
              onChange={(e) => setEstadoFiltro(e.target.value)}
              className="min-h-9 min-w-[10.5rem] flex-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-sm sm:min-h-0 sm:flex-none sm:text-xs"
            >
              <option value="">Todos los estados</option>
              <option value="programado">Programado</option>
              <option value="hecho">Hecho</option>
            </select>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-slate-500">
            {["L", "M", "X", "J", "V", "S", "D"].map((dia) => <span key={dia}>{dia}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {(modoCalendario === "semana" ? diasSemana : diasMes).map((dia, index) => {
              if (!dia) return <div key={`vacio-${index}`} />;
              const clave = isoDia(dia);
              const cantidad = (postsPorDia[clave] || []).length;
              const activo = clave === diaSeleccionado;
              return (
                <button
                  key={clave}
                  type="button"
                  onClick={() => {
                    setDiaSeleccionado(clave);
                    setPostForm((prev) => ({ ...prev, fecha: clave }));
                  }}
                  className={`min-h-12 rounded-md border px-1 py-1 text-left text-xs ${activo ? "border-fuchsia-500 bg-fuchsia-950/40" : "border-slate-800 bg-slate-900"}`}
                >
                  <span>{dia.getDate()}</span>
                  {cantidad > 0 && <span className="mt-1 block text-[10px] text-fuchsia-300">{cantidad}</span>}
                </button>
              );
            })}
          </div>
          <form onSubmit={guardarPost} className="grid gap-2 rounded-md border border-slate-700 p-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <select value={postForm.clienteId} onChange={(e) => setPostForm({ ...postForm, clienteId: e.target.value })} required className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm sm:max-w-xs">
                <option value="">Cliente de RRSS</option>
                {clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.nombre}</option>)}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                Este listado es de la cartera de redes.
                {admin && (
                  <button type="button" onClick={() => setVista("clientes")} className="ml-1 text-fuchsia-300">Agregar cliente</button>
                )}
              </p>
              {clienteElegido?.driveUrl && (
                <a
                  href={clienteElegido.driveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-xs text-fuchsia-300"
                >
                  Abrir Drive del cliente
                </a>
              )}
            </div>
            <input type="date" value={postForm.fecha} onChange={(e) => { setPostForm({ ...postForm, fecha: e.target.value }); setDiaSeleccionado(e.target.value); }} className="min-h-10 w-full min-w-0 rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm" required />
            <input type="time" value={postForm.hora} onChange={(e) => setPostForm({ ...postForm, hora: e.target.value })} className="min-h-10 w-full min-w-0 rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm" />
            <div className="flex flex-wrap gap-1.5 sm:col-span-2">
              {[
                ["unica", "Un día"],
                ["dias", "Varios días"],
                ["fija", "Fija cada semana"]
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPostForm((prev) => ({
                    ...prev,
                    repeticion: id,
                    diasSemana: id === "fija" && prev.diasSemana.length === 0 && prev.fecha
                      ? [fechaLocal(prev.fecha).getDay()]
                      : prev.diasSemana
                  }))}
                  className={`min-h-9 rounded-md px-2.5 py-1.5 text-sm sm:min-h-0 sm:px-2 sm:py-1 sm:text-xs ${postForm.repeticion === id ? "bg-fuchsia-600 text-white" : "bg-slate-800 text-slate-300"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {postForm.repeticion === "dias" && (
              <div className="sm:col-span-2">
                <p className="mb-1 text-xs text-slate-500">La fecha de arriba también cuenta. Sumá los otros días en los que sale el mismo material.</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    key={postForm.fechas.join("|")}
                    type="date"
                    onChange={(e) => {
                      const iso = e.target.value;
                      if (!iso || iso === postForm.fecha || postForm.fechas.includes(iso)) return;
                      setPostForm((prev) => ({ ...prev, fechas: [...prev.fechas, iso].sort() }));
                    }}
                    className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
                  />
                  {postForm.fechas.map((iso) => (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => setPostForm((prev) => ({ ...prev, fechas: prev.fechas.filter((dia) => dia !== iso) }))}
                      className="rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-200"
                    >
                      {iso.split("-").reverse().join("/")} ×
                    </button>
                  ))}
                </div>
              </div>
            )}
            {postForm.repeticion === "fija" && (
              <div className="sm:col-span-2">
                <p className="mb-1 text-xs text-slate-500">Se repite cada semana a partir de la fecha elegida. Marcar hecho cierra solo ese día.</p>
                <div className="flex flex-wrap gap-1.5">
                  {DIAS_SEMANA.map((dia) => {
                    const activo = postForm.diasSemana.includes(dia.id);
                    return (
                      <label key={dia.id} className={`flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm sm:min-h-0 sm:px-2 sm:py-1 sm:text-xs ${activo ? "border-fuchsia-500 bg-fuchsia-950/40 text-white" : "border-slate-700 text-slate-300"}`}>
                        <input
                          type="checkbox"
                          checked={activo}
                          onChange={() => setPostForm((prev) => ({
                            ...prev,
                            diasSemana: activo
                              ? prev.diasSemana.filter((id) => id !== dia.id)
                              : [...prev.diasSemana, dia.id]
                          }))}
                          className="accent-fuchsia-500"
                        />
                        {dia.label}
                      </label>
                    );
                  })}
                  <button type="button" onClick={() => setPostForm((prev) => ({ ...prev, diasSemana: [1, 2, 3, 4, 5] }))} className="min-h-9 rounded-md bg-slate-800 px-2.5 py-1.5 text-sm text-slate-300 sm:min-h-0 sm:px-2 sm:py-1 sm:text-xs">Lun a vie</button>
                  <button type="button" onClick={() => setPostForm((prev) => ({ ...prev, diasSemana: [1, 2, 3, 4, 5, 6, 0] }))} className="min-h-9 rounded-md bg-slate-800 px-2.5 py-1.5 text-sm text-slate-300 sm:min-h-0 sm:px-2 sm:py-1 sm:text-xs">Toda la semana</button>
                </div>
              </div>
            )}
            <div className="sm:col-span-2">
              <p className="mb-1 text-xs text-slate-500">Formato</p>
              <div className="flex flex-wrap gap-1.5">
              {TIPOS.map((tipo) => {
                const activo = postForm.tipos.includes(tipo.id);
                return (
                  <label key={tipo.id} className={`flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm sm:min-h-0 sm:px-2 sm:py-1 sm:text-xs ${activo ? "border-fuchsia-500 bg-fuchsia-950/40 text-white" : "border-slate-700 text-slate-300"}`}>
                    <input
                      type="checkbox"
                      checked={activo}
                      onChange={() => setPostForm((prev) => ({
                        ...prev,
                        tipos: activo
                          ? prev.tipos.filter((id) => id !== tipo.id)
                          : [...prev.tipos, tipo.id]
                      }))}
                      className="accent-fuchsia-500"
                    />
                    {tipo.label}
                  </label>
                );
              })}
              </div>
            </div>
            <div className="sm:col-span-2">
              <p className="mb-1 text-xs text-slate-500">Redes</p>
              <div className="flex flex-wrap gap-1.5">
              {PLATAFORMAS.map((red) => {
                const activa = postForm.plataformas.includes(red.id);
                return (
                  <label key={red.id} className={`flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm sm:min-h-0 sm:px-2 sm:py-1 sm:text-xs ${activa ? "border-fuchsia-500 bg-fuchsia-950/40 text-white" : "border-slate-700 text-slate-300"}`}>
                    <input
                      type="checkbox"
                      checked={activa}
                      onChange={() => setPostForm((prev) => ({
                        ...prev,
                        plataformas: activa
                          ? prev.plataformas.filter((id) => id !== red.id)
                          : [...prev.plataformas, red.id]
                      }))}
                      className="accent-fuchsia-500"
                    />
                    {red.label}
                  </label>
                );
              })}
              </div>
            </div>
            <input value={postForm.titulo} onChange={(e) => setPostForm({ ...postForm, titulo: e.target.value })} placeholder="Título" required className="min-h-10 w-full min-w-0 rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm sm:col-span-2" />
            <textarea value={postForm.copy} onChange={(e) => setPostForm({ ...postForm, copy: e.target.value })} placeholder="Copy, guion o hashtags" rows={2} className="w-full min-w-0 rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm sm:col-span-2" />
            <input value={postForm.linkMaterial} onChange={(e) => setPostForm({ ...postForm, linkMaterial: e.target.value })} placeholder="Link al material" className="min-h-10 w-full min-w-0 rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm sm:col-span-2" />
            <div className="flex gap-2 sm:col-span-2">
              <button type="submit" disabled={guardando} className="min-h-10 rounded-md bg-fuchsia-600 px-4 py-2 text-sm font-medium disabled:opacity-50 sm:min-h-0 sm:px-3 sm:py-1.5 sm:text-xs">
                {editandoPost ? "Guardar cambios" : "Programar"}
              </button>
              {editandoPost && (
                <button type="button" onClick={cancelarPost} className="min-h-10 rounded-md bg-slate-700 px-4 py-2 text-sm sm:min-h-0 sm:px-3 sm:py-1.5 sm:text-xs">Cancelar</button>
              )}
            </div>
          </form>
          <div className="space-y-1">
            {postsDelDia.map((post) => (
              <FilaPost key={post.id} post={post} onMarcar={marcar} onBorrar={borrarPost} onEditar={editarPost} />
            ))}
            {postsDelDia.length === 0 && <p className="text-sm text-slate-500">No hay publicaciones este día.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function FilaPost({ post, onMarcar, onBorrar, onEditar }) {
  const hecho = post.estado === "hecho";
  return (
    <div className="flex flex-col gap-2 rounded-md border border-slate-700 px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="min-w-0 sm:flex-1">
        <p className={`break-words text-sm font-medium ${hecho ? "text-slate-400 line-through" : ""}`}>{post.titulo}</p>
        <p className="break-words text-xs text-slate-400">
          {post.hora} · {post.cliente?.nombre || "Sin cliente"} · {textoRedes(post)} · {textoTipos(post)}
          {textoAgenda(post) ? ` · ${textoAgenda(post)}` : ""}
          {post.owner?.nombre ? ` · ${post.owner.nombre}` : ""}
        </p>
        {textoHecho(post) && <p className="break-words text-xs text-emerald-300">{textoHecho(post)}</p>}
        <span className="flex gap-3">
          {post.cliente?.driveUrl && (
            <a href={post.cliente.driveUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center text-sm text-fuchsia-300 sm:min-h-0 sm:text-xs">Drive</a>
          )}
          {post.linkMaterial && (
            <a href={post.linkMaterial} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center text-sm text-fuchsia-300 sm:min-h-0 sm:text-xs">Material</a>
          )}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onEditar(post)} className="min-h-9 rounded-md px-2.5 text-sm text-slate-300 sm:min-h-0 sm:px-0 sm:text-xs">Editar</button>
        <button
          type="button"
          onClick={() => onMarcar(post, hecho ? "programado" : "hecho")}
          className={`min-h-9 rounded-md px-3 text-sm sm:min-h-0 sm:px-2 sm:py-1 sm:text-xs ${hecho ? "bg-slate-700 text-slate-200" : "bg-emerald-700 text-white"}`}
        >
          {hecho ? "Reabrir" : "Hecho"}
        </button>
        <button type="button" onClick={() => onBorrar(post)} className="min-h-9 rounded-md px-2.5 text-sm text-red-300 sm:min-h-0 sm:px-0 sm:text-xs">Eliminar</button>
      </div>
    </div>
  );
}

export default function RedesPage() {
  return (
    <ProtectedRoute>
      <RedesContent />
    </ProtectedRoute>
  );
}
