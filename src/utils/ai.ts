// Placeholder AI utilities - replace with actual AI service integration
export const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
  // Simulate AI transcription
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve("Transkriberad text från ljudinspelning. Här är exempel på vad som kan sägas under en inspektion.");
    }, 2000);
  });
};

export const summarizeNotes = async (notes: string[]): Promise<string> => {
  // Simulate AI summarization
  return new Promise((resolve) => {
    setTimeout(() => {
      const summary = `
Sammanfattning av inspektion:

• Ventilationssystem: Kontrollerat och fungerar normalt
• Elektriska installationer: Inga problem upptäckta
• Rörledningar: Mindre läckage vid huvudkran
• Säkerhetsutrustning: Branddetektorer testade och godkända
• Rekommendationer: Byt tätning vid huvudkran inom 30 dagar

Totalt: 1 problem upptäckt, 4 system kontrollerade
Status: Godkänd med mindre åtgärder
      `.trim();
      resolve(summary);
    }, 3000);
  });
};

export const askAI = async (question: string, context: string): Promise<string> => {
  // Simulate AI chat response
  return new Promise((resolve) => {
    setTimeout(() => {
      const responses = [
        "Baserat på inspektionsanteckningarna hittade vi totalt 1 problem i ventilationssystemet.",
        "Enligt dokumentationen är alla säkerhetssystem godkända och fungerar som de ska.",
        "Rekommenderade åtgärder inkluderar byte av tätning vid huvudkran inom 30 dagar.",
        "Inspektionen visar att byggnaden är i gott skick med endast mindre underhållsbehov."
      ];
      const randomResponse = responses[Math.floor(Math.random() * responses.length)];
      resolve(randomResponse);
    }, 1500);
  });
};

export const askGlobalAI = async (question: string, projects: any[]): Promise<string> => {
  // Simulate global AI search and response
  return new Promise((resolve) => {
    setTimeout(() => {
      // Check if question mentions specific project names
      const lowerQuestion = question.toLowerCase();
      
      if (lowerQuestion.includes('skarpnäck') && lowerQuestion.includes('ventilation')) {
        resolve(`I projektet Skarpnäck Rondering noterades följande om ventilationen:

– Två fläktar i källaren låter ovanligt högt och bör kontrolleras
– Ett filter i trapphus B är igensatt och behöver bytas
– Inga synliga skador på kanalerna, men rengöring rekommenderas

Senaste inspektionen gjordes den 14 juni 2025 av Johan Larsson.

Vill du att jag sammanställer en rapport om ventilationssystemet i det här projektet?`);
      }
      
      if (lowerQuestion.includes('problem') || lowerQuestion.includes('fel')) {
        resolve(`Baserat på alla dina projekt har jag hittat följande problem:

**Ventilationssystem:**
• 3 fläktar som behöver service
• 2 filter som behöver bytas
• 1 kanal som behöver rengöring

**Elektriska system:**
• 1 säkring som behöver bytas
• 2 uttag som behöver kontrolleras

**Rörledningar:**
• 1 mindre läckage vid huvudkran

Totalt: 9 problem identifierade över ${projects.length} projekt.`);
      }
      
      if (lowerQuestion.includes('månaden') || lowerQuestion.includes('antal')) {
        resolve(`Under den här månaden har du genomfört ${projects.length} inspektionsprojekt med totalt ${projects.reduce((sum, p) => sum + p.notes.length, 0)} anteckningar.

De senaste projekten:
${projects.slice(0, 3).map((p, i) => `${i + 1}. ${p.name} - ${p.location}`).join('\n')}

Genomsnittligt antal anteckningar per projekt: ${Math.round(projects.reduce((sum, p) => sum + p.notes.length, 0) / Math.max(projects.length, 1))}`);
      }
      
      // Default response
      resolve(`Jag har sökt igenom alla dina ${projects.length} projekt och ${projects.reduce((sum, p) => sum + p.notes.length, 0)} anteckningar. 

Kan du vara mer specifik med din fråga? Till exempel:
• Vilket projekt är du intresserad av?
• Vilket system vill du veta mer om (ventilation, el, rör)?
• Söker du efter specifika problem eller allmän information?`);
    }, 2000);
  });
};