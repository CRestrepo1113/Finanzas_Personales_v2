import { State } from './state.js';

export const ImportService = {
    init() {
        const importBtn = document.getElementById('import-csv');
        const exportBtn = document.getElementById('export-csv');

        if (importBtn) {
            // Crear un input de archivo oculto
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.csv';
            fileInput.style.display = 'none';
            document.body.appendChild(fileInput);

            importBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => this.handleFile(e));
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportCSV());
        }
    },

    handleFile(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target.result;
            await this.parseCSV(text);
        };
        reader.readAsText(file);
    },

    exportCSV() {
        if (!State.profilesState) {
            alert("Error: El estado de los perfiles no se ha cargado correctamente.");
            return;
        }

        if (!confirm('⚠️ COPIA DE SEGURIDAD: ¿Deseas exportar una copia de seguridad consolidada de TODOS tus perfiles financieros en un archivo CSV?')) return;

        let csvContent = "";
        
        State.profilesState.profiles.forEach(p => {
            csvContent += `@@@ PROFILE_START | ${p.id} | ${p.name} @@@\n\n`;
            
            csvContent += "### AJUSTES_SISTEMA ###\nBaseCurrency,ExchangeRates\n";
            csvContent += `${p.db.settings.baseCurrency},"${JSON.stringify(p.db.settings.exchangeRates).replace(/"/g, '""')}"\n\n`;

            csvContent += "### BLOQUE_CUENTAS ###\nid,name,currency,balance,type,color\n";
            p.db.accounts.forEach(a => { 
                csvContent += `${a.id},"${a.name}",${a.currency},${a.balance},${a.type},${a.color || ''}\n`; 
            });
            csvContent += "\n";

            csvContent += "### BLOQUE_CATEGORIAS ###\nid,name,type,budget,visual_color,icon,subtype\n";
            p.db.categories.forEach(c => { 
                csvContent += `${c.id},"${c.name}",${c.type},${c.budget},${c.visual_color},${c.icon},${c.subtype || 'variable'}\n`; 
            });
            csvContent += "\n";

            csvContent += "### BLOQUE_METAS ###\nid,name,target,current,icon,account_id,is_emergency\n";
            p.db.goals.forEach(g => { 
                csvContent += `${g.id},"${g.name}",${g.target},${g.current || 0},${g.icon},${g.account_id || ''},${g.is_emergency ? 'true' : 'false'}\n`; 
            });
            csvContent += "\n";

            csvContent += "### BLOQUE_TRANSACCIONES ###\nid,type,date,amount,amount_extracted,amount_received,from_account_id,to_account_id,category_id,account_id,notes,foreign_account_name,is_cross_profile,cross_link_id,target_profile_id\n";
            p.db.transactions.forEach(tx => {
                let notes = (tx.notes || '').replace(/"/g, '""');
                let fAccName = (tx.foreign_account_name || '').replace(/"/g, '""');
                csvContent += `${tx.id},${tx.type},${tx.date},${tx.amount || 0},${tx.amount_extracted || 0},${tx.amount_received || 0},${tx.from_account_id || ''},${tx.to_account_id || ''},${tx.category_id || ''},${tx.account_id || ''},"${notes}","${fAccName}",${tx.is_cross_profile ? 'true' : 'false'},${tx.cross_link_id || ''},${tx.target_profile_id || ''}\n`;
            });
            csvContent += "\n";
        });

        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.setAttribute("download", `Finanzas_BackupFullProfiles_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        console.log("CSV: Copia de seguridad exportada con éxito.");
    },

    async parseCSV(text) {
        if (!text.includes('### BLOQUE_CUENTAS ###')) {
            alert("Error: El archivo no tiene el formato de backup correcto.");
            return;
        }

        if (!confirm("⚠️ ADVERTENCIA CRÍTICA: Importar esta copia sobrescribirá TODOS tus perfiles y datos financieros actuales. ¿Confirmas esta acción destructiva?")) {
            return;
        }

        const lines = text.split('\n').map(l => l.trim());
        let mode = '';
        let profiles = [];
        let currentProfile = null;

        const parseLine = (str) => {
            const arr = []; let inQuote = false; let val = "";
            for (let i = 0; i < str.length; i++) {
                const c = str[i];
                if(c === '"') {
                    if(inQuote && str[i+1] === '"') { val += '"'; i++; }
                    else { inQuote = !inQuote; }
                } else if(c === ',' && !inQuote) { arr.push(val); val = ""; }
                else { val += c; }
            }
            arr.push(val); return arr;
        };

        for (let line of lines) {
            if (!line) continue;

            if (line.startsWith('@@@ PROFILE_START')) {
                const parts = line.split('|').map(s => s.trim());
                currentProfile = {
                    id: parts[1],
                    name: parts[2].replace('@@@', '').trim(),
                    color: '#8C9970',
                    icon: 'fa-user',
                    db: { settings: {}, accounts: [], categories: [], goals: [], transactions: [] }
                };
                profiles.push(currentProfile);
                continue;
            }

            if (line.startsWith('### ')) {
                mode = line;
                continue;
            }

            const cols = parseLine(line);
            const db = currentProfile?.db;
            if (!db) continue;

            const parseId = (id) => isNaN(Number(id)) ? id : Number(id);
            const parseVal = (v) => parseFloat(String(v || '0').replace(',', '.')) || 0;

            switch (mode) {
                case '### AJUSTES_SISTEMA ###':
                    if (cols[0] !== 'BaseCurrency' && cols[0] !== '### AJUSTES_SISTEMA ###') {
                        db.settings.baseCurrency = cols[0];
                        try { db.settings.exchangeRates = JSON.parse(cols[1]); } catch(e){}
                    }
                    break;
                case '### BLOQUE_CUENTAS ###':
                    if (cols[0] !== 'id' && cols[0] !== '### BLOQUE_CUENTAS ###') {
                        db.accounts.push({
                            id: parseId(cols[0]), name: cols[1], currency: cols[2],
                            balance: parseVal(cols[3]), type: cols[4], color: cols[5]
                        });
                    }
                    break;
                case '### BLOQUE_CATEGORIAS ###':
                    if (cols[0] !== 'id' && cols[0] !== '### BLOQUE_CATEGORIAS ###') {
                        db.categories.push({
                            id: parseId(cols[0]), name: cols[1], type: cols[2],
                            budget: parseVal(cols[3]), visual_color: cols[4],
                            icon: cols[5], subtype: cols[6] || 'variable'
                        });
                    }
                    break;
                case '### BLOQUE_METAS ###':
                    if (cols[0] !== 'id' && cols[0] !== '### BLOQUE_METAS ###') {
                        db.goals.push({
                            id: parseId(cols[0]), 
                            name: cols[1], 
                            target: parseVal(cols[2]),
                            current: parseVal(cols[3]), 
                            icon: cols[4],
                            account_id: cols[5] ? parseId(cols[5]) : null,
                            is_emergency: cols[6] === 'true'
                        });
                    }
                    break;
                case '### BLOQUE_TRANSACCIONES ###':
                    if (cols[0] !== 'id' && cols[0] !== '### BLOQUE_TRANSACCIONES ###') {
                        const amount = parseVal(cols[3]);
                        const amountExtracted = parseVal(cols[4]);
                        if (amount !== 0 || amountExtracted !== 0) {
                            db.transactions.push({
                                id: cols[0], 
                                type: cols[1], 
                                date: cols[2],
                                amount: amount,
                                amount_extracted: amountExtracted,
                                amount_received: parseVal(cols[5]),
                                from_account_id: parseId(cols[6]), 
                                to_account_id: parseId(cols[7]),
                                category_id: parseId(cols[8]), 
                                account_id: parseId(cols[9]), 
                                notes: cols[10],
                                foreign_account_name: cols[11],
                                is_cross_profile: cols[12] === 'true'
                            });
                        }
                    }
                    break;
            }
        }

        if (profiles.length > 0) {
            await State.importData(profiles);
            alert(`¡Éxito! Se han importado ${profiles.length} perfil(es) con todos sus datos reales.`);
            location.reload(); // Recargar para aplicar y renderizar
        }
    }
};
