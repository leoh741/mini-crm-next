// Layout específico para las páginas de email
// No aplica el max-w-4xl del layout principal para que ocupe todo el ancho

export default function EmailLayout({ children }) {
  return (
    <div 
      className="w-full h-full" 
      style={{ 
        maxWidth: '100vw', 
        margin: '0', 
        padding: '0',
        marginLeft: 'calc(-50vw + 50%)',
        marginRight: 'calc(-50vw + 50%)',
        width: '100vw',
        position: 'relative'
      }}
    >
      {children}
    </div>
  );
}

