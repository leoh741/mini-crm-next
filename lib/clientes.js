export const clientes = [
  { 
    id: "1", 
    nombre: "Panadería La Espiga", 
    rubro: "Gastronomía", 
    ciudad: "Rosario", 
    email: "contacto@laespiga.com",
    montoPago: 50000,
    fechaPago: 5, // día del mes
    pagado: false
  },
  { 
    id: "2", 
    nombre: "GYM PowerFit", 
    rubro: "Gimnasio", 
    ciudad: "Funes", 
    email: "info@powerfit.com",
    montoPago: 75000,
    fechaPago: 10,
    pagado: true
  },
  { 
    id: "3", 
    nombre: "Digital Space", 
    rubro: "Marketing Digital", 
    ciudad: "Rosario", 
    email: "hola@digitalspace.com.ar",
    montoPago: 120000,
    fechaPago: 1,
    pagado: true
  },
  { 
    id: "4", 
    nombre: "Veterinaria Universo Pets", 
    rubro: "Pet Shop", 
    ciudad: "Rosario", 
    email: "contacto@universopets.com",
    montoPago: 45000,
    fechaPago: 15,
    pagado: false
  },
];

export function getClienteById(id) {
  return clientes.find((c) => c.id === id);
}

