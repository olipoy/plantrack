import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Project } from '../types';

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