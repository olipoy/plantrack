import html2pdf from 'html2pdf.js';

export const renderHtmlTemplate = async (templateName: string, data: any): Promise<string> => {
  console.log(`Loading template: ${templateName}`);

  const templatePath = `/pdfTemplates/${templateName}.html`;

  try {
    const response = await fetch(templatePath);
    if (!response.ok) {
      throw new Error(`Failed to load template: ${templateName}`);
    }

    let html = await response.text();

    html = replacePlaceholders(html, data);

    console.log(`Template ${templateName} rendered successfully`);
    return html;
  } catch (error) {
    console.error('Template rendering error:', error);
    throw error;
  }
};

const replacePlaceholders = (html: string, data: any): string => {
  let result = html;

  result = result.replace(/\{\{project\.name\}\}/g, escapeHtml(data.project?.name || ''));
  result = result.replace(/\{\{project\.address\}\}/g, escapeHtml(data.project?.address || 'Ej angiven'));
  result = result.replace(/\{\{project\.date\}\}/g, escapeHtml(data.project?.date || ''));
  result = result.replace(/\{\{project\.inspector\}\}/g, escapeHtml(data.project?.inspector || 'Ej angiven'));

  result = processConditionals(result, data);

  result = processLoops(result, data);

  return result;
};

const processConditionals = (html: string, data: any): string => {
  let result = html;

  const ifRegex = /\{\{#if (\w+)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g;
  result = result.replace(ifRegex, (match, condition, trueBlock, falseBlock) => {
    const value = getNestedValue(data, condition);
    return value ? trueBlock : falseBlock;
  });

  const simpleIfRegex = /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
  result = result.replace(simpleIfRegex, (match, condition, content) => {
    const value = getNestedValue(data, condition);
    return value ? content : '';
  });

  return result;
};

const processLoops = (html: string, data: any): string => {
  let result = html;

  const eachRegex = /\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g;

  result = result.replace(eachRegex, (match, arrayName, template) => {
    const array = getNestedValue(data, arrayName);

    if (!Array.isArray(array) || array.length === 0) {
      return '';
    }

    return array.map(item => {
      let itemHtml = template;

      itemHtml = itemHtml.replace(/\{\{(\w+)\}\}/g, (m, key) => {
        return escapeHtml(item[key] || '');
      });

      itemHtml = itemHtml.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (m, condition, content) => {
        return item[condition] ? content : '';
      });

      itemHtml = itemHtml.replace(/\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (m, nestedArrayName, nestedTemplate) => {
        const nestedArray = item[nestedArrayName];
        if (!Array.isArray(nestedArray) || nestedArray.length === 0) {
          return '';
        }
        return nestedArray.map((nestedItem: any) => {
          let nestedHtml = nestedTemplate;
          nestedHtml = nestedHtml.replace(/\{\{(\w+)\}\}/g, (m2, key) => {
            return escapeHtml(nestedItem[key] || '');
          });
          nestedHtml = nestedHtml.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (m2, cond, cont) => {
            return nestedItem[cond] ? cont : '';
          });
          return nestedHtml;
        }).join('');
      });

      return itemHtml;
    }).join('');
  });

  return result;
};

const getNestedValue = (obj: any, path: string): any => {
  return path.split('.').reduce((current, key) => current?.[key], obj);
};

const escapeHtml = (text: string): string => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

export const generatePdfFromHtml = async (htmlString: string, fileName: string): Promise<{ pdfBuffer: string; fileName: string }> => {
  console.log('Generating PDF from HTML...');

  const element = document.createElement('div');
  element.innerHTML = htmlString;
  element.style.width = '210mm';
  element.style.minHeight = '297mm';

  const opt = {
    margin: 10,
    filename: fileName,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  try {
    const pdf = await html2pdf().set(opt).from(element).outputPdf('datauristring');

    const pdfBuffer = pdf.split(',')[1];

    console.log('PDF generated successfully');
    return { pdfBuffer, fileName };
  } catch (error) {
    console.error('PDF generation error:', error);
    throw error;
  }
};
