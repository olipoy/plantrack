import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Project } from '../types';

export const generateProjectPDF = async (project: Project): Promise<{ pdfBuffer: string; fileName: string }> => {
  console.log('=== PDF GENERATION START ===');
  console.log('Project data:', {
    name: project.name,
    notesCount: project.notes?.length || 0,
    hasAiSummary: !!project.aiSummary
  });
  
  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 20;
  const lineHeight = 10;
  let yPosition = margin;

  // Title
  console.log('Adding PDF title...');
  pdf.setFontSize(20);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Inspektionsrapport', margin, yPosition);
  yPosition += lineHeight * 2;

  // Project Info
  console.log('Adding project info...');
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Projekt: ${project.name}`, margin, yPosition);
  yPosition += lineHeight;
  pdf.text(`Plats: ${project.location || 'Ej specificerad'}`, margin, yPosition);
  yPosition += lineHeight;
  pdf.text(`Datum: ${project.createdAt.toLocaleDateString('sv-SE')}`, margin, yPosition);
  yPosition += lineHeight * 2;

  // AI Summary
  if (project.aiSummary) {
    console.log('Adding AI summary...');
    pdf.setFont('helvetica', 'bold');
    pdf.text('AI-Sammanfattning:', margin, yPosition);
    yPosition += lineHeight;
    pdf.setFont('helvetica', 'normal');
    
    const summaryLines = pdf.splitTextToSize(project.aiSummary, pageWidth - 2 * margin);
    summaryLines.forEach((line: string) => {
      if (yPosition > pdf.internal.pageSize.getHeight() - margin) {
        pdf.addPage();
        yPosition = margin;
      }
      pdf.text(line, margin, yPosition);
      yPosition += lineHeight;
    });
    yPosition += lineHeight;
  }

  // Notes
  if (project.notes && project.notes.length > 0) {
    console.log('Adding notes section...');
    pdf.setFont('helvetica', 'bold');
    pdf.text('Anteckningar:', margin, yPosition);
    yPosition += lineHeight;
    pdf.setFont('helvetica', 'normal');

    project.notes.forEach((note, index) => {
      console.log(`Processing note ${index + 1}/${project.notes.length}:`, note.type);
      
      if (yPosition > pdf.internal.pageSize.getHeight() - margin * 2) {
        pdf.addPage();
        yPosition = margin;
      }

      // Handle different note types safely
      let noteContent = note.content || '';
      if (note.type === 'video' && note.transcription) {
        noteContent = note.transcription;
      } else if (note.type === 'photo' && note.imageLabel) {
        noteContent = note.imageLabel;
      }
      
      const noteText = `${index + 1}. [${note.type.toUpperCase()}] ${noteContent}`;
      const noteLines = pdf.splitTextToSize(noteText, pageWidth - 2 * margin);
      
      noteLines.forEach((line: string) => {
        pdf.text(line, margin, yPosition);
        yPosition += lineHeight;
      });
      yPosition += lineHeight / 2;
    });
  }

  // Return PDF as base64 buffer and filename
  console.log('Generating PDF output...');
  const pdfBuffer = pdf.output('datauristring').split(',')[1]; // Remove data:application/pdf;base64, prefix
  const fileName = `${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_inspection_report.pdf`;
  
  console.log('=== PDF GENERATION COMPLETE ===');
  console.log('Generated file:', fileName);
  return { pdfBuffer, fileName };
};

export const exportProjectToPDF = async (project: Project): Promise<void> => {
  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 20;
  const lineHeight = 10;
  let yPosition = margin;

  // Title
  pdf.setFontSize(20);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Inspektionsrapport', margin, yPosition);
  yPosition += lineHeight * 2;

  // Project Info
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Projekt: ${project.name}`, margin, yPosition);
  yPosition += lineHeight;
  pdf.text(`Plats: ${project.location}`, margin, yPosition);
  yPosition += lineHeight;
  pdf.text(`Datum: ${project.createdAt.toLocaleDateString('sv-SE')}`, margin, yPosition);
  yPosition += lineHeight * 2;

  // AI Summary
  if (project.aiSummary) {
    pdf.setFont('helvetica', 'bold');
    pdf.text('AI-Sammanfattning:', margin, yPosition);
    yPosition += lineHeight;
    pdf.setFont('helvetica', 'normal');
    
    const summaryLines = pdf.splitTextToSize(project.aiSummary, pageWidth - 2 * margin);
    summaryLines.forEach((line: string) => {
      if (yPosition > pdf.internal.pageSize.getHeight() - margin) {
        pdf.addPage();
        yPosition = margin;
      }
      pdf.text(line, margin, yPosition);
      yPosition += lineHeight;
    });
    yPosition += lineHeight;
  }

  // Notes
  if (project.notes.length > 0) {
    pdf.setFont('helvetica', 'bold');
    pdf.text('Anteckningar:', margin, yPosition);
    yPosition += lineHeight;
    pdf.setFont('helvetica', 'normal');

    project.notes.forEach((note, index) => {
      if (yPosition > pdf.internal.pageSize.getHeight() - margin * 2) {
        pdf.addPage();
        yPosition = margin;
      }

      const noteText = `${index + 1}. [${note.type.toUpperCase()}] ${note.transcription || note.content}`;
      const noteLines = pdf.splitTextToSize(noteText, pageWidth - 2 * margin);
      
      noteLines.forEach((line: string) => {
        pdf.text(line, margin, yPosition);
        yPosition += lineHeight;
      });
      yPosition += lineHeight / 2;
    });
  }

  // Save PDF
  pdf.save(`${project.name}_inspection_report.pdf`);
};