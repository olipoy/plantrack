import html2pdf from 'html2pdf.js';
import Handlebars from 'handlebars';

export const renderHtmlTemplate = async (templateName: string, data: any): Promise<string> => {
  console.log(`Loading template: ${templateName}`);
  console.log('Template data:', JSON.stringify(data, null, 2));

  const templatePath = `/pdfTemplates/${templateName}.html`;

  try {
    const response = await fetch(templatePath);
    if (!response.ok) {
      throw new Error(`Failed to load template: ${templateName}`);
    }

    const templateSource = await response.text();

    const template = Handlebars.compile(templateSource);

    const html = template(data);

    console.log(`Template ${templateName} rendered successfully with Handlebars`);
    console.log('Rendered HTML length:', html.length);

    return html;
  } catch (error) {
    console.error('Template rendering error:', error);
    throw error;
  }
};

export const generatePdfFromHtml = async (htmlString: string, fileName: string): Promise<{ pdfBuffer: string; fileName: string }> => {
  console.log('Generating PDF from HTML...');

  const element = document.createElement('div');
  element.innerHTML = htmlString;
  element.style.width = '210mm';
  element.style.minHeight = '297mm';

  const images = element.querySelectorAll('img');
  console.log(`Found ${images.length} images in rendered HTML`);
  images.forEach((img, index) => {
    console.log(`Image ${index + 1}:`, {
      src: img.src ? img.src.substring(0, 100) + '...' : 'none',
      crossOrigin: img.crossOrigin,
      alt: img.alt
    });
  });

  const opt = {
    margin: 10,
    filename: fileName,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: true, allowTaint: false },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  try {
    console.log('Starting html2pdf conversion...');
    const pdf = await html2pdf().set(opt).from(element).outputPdf('datauristring');

    const pdfBuffer = pdf.split(',')[1];

    console.log('PDF generated successfully');
    return { pdfBuffer, fileName };
  } catch (error) {
    console.error('PDF generation error:', error);
    throw error;
  }
};
