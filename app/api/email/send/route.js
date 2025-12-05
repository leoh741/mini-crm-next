// API route para enviar correos electrónicos
// POST /api/email/send
// Soporta FormData para adjuntos

import { NextResponse } from "next/server";
import { enviarCorreo } from "../../../../lib/emailSend.js";

// Forzar que esta ruta sea dinámica (no pre-renderizada durante el build)
export const dynamic = 'force-dynamic';

/**
 * Maneja el envío de correos electrónicos
 * Soporta JSON (sin adjuntos) o FormData (con adjuntos)
 * Requiere: { to, subject, text?, html?, attachments?, replyTo? }
 */
export async function POST(request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    
    let to, subject, text, html, replyTo, attachments = [];

    // Si es FormData (tiene adjuntos)
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      
      to = formData.get('to');
      subject = formData.get('subject');
      text = formData.get('text') || '';
      html = formData.get('html') || '';
      replyTo = formData.get('replyTo') || null;

      // Procesar archivos adjuntos
      const attachmentFiles = [];
      let index = 0;
      while (formData.has(`attachment_${index}`)) {
        const file = formData.get(`attachment_${index}`);
        if (file && file instanceof File) {
          // Convertir File a buffer
          const arrayBuffer = await file.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          
          attachmentFiles.push({
            filename: file.name,
            content: buffer,
            contentType: file.type || 'application/octet-stream',
          });
        }
        index++;
      }
      attachments = attachmentFiles;
    } else {
      // Si es JSON (sin adjuntos)
      const body = await request.json();
      to = body.to;
      subject = body.subject;
      text = body.text || '';
      html = body.html || '';
      replyTo = body.replyTo || null;
      attachments = body.attachments || [];
    }

    // Validar parámetros obligatorios
    if (!to || !subject) {
      return NextResponse.json(
        { success: false, error: "Faltan parámetros: 'to' y 'subject' son obligatorios" },
        { status: 400 }
      );
    }

    // Enviar el correo
    const info = await enviarCorreo({ to, subject, text, html, attachments, replyTo });

    return NextResponse.json(
      {
        success: true,
        messageId: info.messageId,
        message: "Correo enviado exitosamente",
        attachmentsCount: attachments.length,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ Error en API /api/email/send:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error desconocido al enviar el correo",
      },
      { status: 500 }
    );
  }
}

