import { State } from './state.js';
import { DriveService } from './drive.js';

export const ImportService = {
    init() {
        // Enlazar referencias de UI
        const btnCloudSync = document.getElementById('btn-cloud-sync');
        const modalCloud = document.getElementById('cloud-sync-modal');
        const btnCloseCloud = document.getElementById('close-cloud-modal');
        
        const inputClientId = document.getElementById('drive-client-id');
        const inputApiKey = document.getElementById('drive-api-key');
        const checkboxAutoSync = document.getElementById('drive-auto-sync');
        
        const btnConnect = document.getElementById('btn-drive-connect');
        const btnSyncNow = document.getElementById('btn-drive-sync-now');
        const btnDisconnect = document.getElementById('btn-drive-disconnect');
        
        const btnLocalImport = document.getElementById('btn-local-import');
        const btnLocalExport = document.getElementById('btn-local-export');

        // Exponer el servicio globalmente para que state.js pueda consultar el estado
        window.DriveService = DriveService;

        // 1. Evento para abrir y cerrar el modal
        if (btnCloudSync && modalCloud) {
            btnCloudSync.addEventListener('click', () => {
                this.updateCloudUI();
                modalCloud.classList.remove('hidden');
            });
        }

        if (btnCloseCloud && modalCloud) {
            btnCloseCloud.addEventListener('click', () => {
                modalCloud.classList.add('hidden');
            });
        }

        // Cerrar modal al hacer clic fuera del contenido
        if (modalCloud) {
            modalCloud.addEventListener('click', (e) => {
                if (e.target === modalCloud) modalCloud.classList.add('hidden');
            });
        }

        // 2. Control de Ajustes en el modal
        if (inputClientId) {
            // Cargar valor guardado al inicio
            inputClientId.value = DriveService.getClientId();
            inputClientId.addEventListener('input', (e) => {
                DriveService.setClientId(e.target.value);
                this.updateCloudUI();
            });
        }

        if (inputApiKey) {
            // Cargar valor guardado al inicio
            inputApiKey.value = DriveService.getApiKey();
            inputApiKey.addEventListener('input', (e) => {
                DriveService.setApiKey(e.target.value);
                this.updateCloudUI();
            });
        }

        if (checkboxAutoSync) {
            // Cargar valor guardado al inicio
            checkboxAutoSync.checked = DriveService.getAutoSync();
            checkboxAutoSync.addEventListener('change', (e) => {
                DriveService.setAutoSync(e.target.checked);
            });
        }

        // 3. Eventos de botones de Google Drive
        if (btnConnect) {
            btnConnect.addEventListener('click', async () => {
                const clientId = DriveService.getClientId();
                const apiKey = DriveService.getApiKey();
                if (!clientId || !apiKey) {
                    alert("⚠️ ERROR: Introduce tu Google OAuth Client ID y tu Google API Key antes de intentar conectarte.");
                    return;
                }
                
                try {
                    btnConnect.disabled = true;
                    btnConnect.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Conectando...';
                    
                    await DriveService.requestToken();
                    await DriveService.sync(true); // Sincronización inicial
                    
                    this.updateCloudUI();
                } catch (error) {
                    alert(`Error de conexión: ${error.message}`);
                } finally {
                    btnConnect.disabled = false;
                    btnConnect.innerHTML = '<i class="fab fa-google"></i> Conectar Google Drive';
                }
            });
        }

        if (btnSyncNow) {
            btnSyncNow.addEventListener('click', async () => {
                try {
                    btnSyncNow.disabled = true;
                    btnSyncNow.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Sincronizando...';
                    btnCloudSync.classList.add('syncing');
                    
                    await DriveService.sync(true);
                } catch (error) {
                    alert(`Error de sincronización: ${error.message}`);
                } finally {
                    btnSyncNow.disabled = false;
                    btnSyncNow.innerHTML = '<i class="fas fa-sync-alt"></i> Sincronizar Ahora';
                    btnCloudSync.classList.remove('syncing');
                    this.updateCloudUI();
                }
            });
        }

        if (btnDisconnect) {
            btnDisconnect.addEventListener('click', () => {
                if (confirm("¿Estás seguro de que deseas desconectar tu cuenta de Google Drive? Se detendrá la sincronización en la nube (tus datos locales se conservarán intactos).")) {
                    DriveService.disconnect();
                    this.updateCloudUI();
                }
            });
        }

        // 4. Configurar callbacks en DriveService para mantener la UI sincronizada
        DriveService.onStatusChange = () => {
            this.updateCloudUI();
        };

        // 5. Soporte para backups CSV locales (Reubicados en el modal)
        if (btnLocalImport) {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.csv';
            fileInput.style.display = 'none';
            document.body.appendChild(fileInput);

            btnLocalImport.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => this.handleLocalFile(e));
        }

        if (btnLocalExport) {
            btnLocalExport.addEventListener('click', () => this.exportCSV());
        }

        // Dibujar UI inicial
        this.updateCloudUI();
    },

    /**
     * Actualiza el estado visual de la cabecera y del modal
     */
    updateCloudUI() {
        const btnCloudSync = document.getElementById('btn-cloud-sync');
        const statusText = document.getElementById('cloud-sync-status-text');
        
        const statusCard = document.getElementById('drive-connection-status');
        const userDetails = document.getElementById('drive-user-details');
        const userEmail = document.getElementById('drive-user-email');
        const lastSyncTime = document.getElementById('drive-last-sync-time');
        
        const btnConnect = document.getElementById('btn-drive-connect');
        const btnSyncNow = document.getElementById('btn-drive-sync-now');
        const btnDisconnect = document.getElementById('btn-drive-disconnect');

        if (!btnCloudSync) return;

        const isConnected = DriveService.isConnected();
        const email = DriveService.getUserEmail();
        const lastSynced = DriveService.getLastSynced();
        const hasCredentials = !!DriveService.getClientId() && !!DriveService.getApiKey();

        // 1. Actualizar estado de conexión
        if (isConnected) {
            btnCloudSync.classList.add('connected');
            
            if (statusCard) {
                statusCard.innerText = 'Conectado';
                statusCard.style.backgroundColor = 'var(--action-income)';
                statusCard.style.color = '#fff';
            }
            if (userDetails) {
                userDetails.classList.remove('hidden');
                if (userEmail) userEmail.innerText = email || 'Cuenta Vinculada';
            }
            
            if (btnConnect) btnConnect.classList.add('hidden');
            if (btnSyncNow) btnSyncNow.classList.remove('hidden');
            if (btnDisconnect) btnDisconnect.classList.remove('hidden');
        } else {
            btnCloudSync.classList.remove('connected');
            
            if (statusCard) {
                statusCard.innerText = 'Desconectado';
                statusCard.style.backgroundColor = 'var(--action-expense)';
                statusCard.style.color = '#fff';
            }
            if (userDetails) userDetails.classList.add('hidden');
            
            if (btnConnect) btnConnect.classList.remove('hidden');
            if (btnSyncNow) btnSyncNow.classList.add('hidden');
            if (btnDisconnect) btnDisconnect.classList.add('hidden');

            // Deshabilitar botón conectar si no hay credenciales completas
            if (btnConnect) {
                btnConnect.style.opacity = hasCredentials ? '1' : '0.5';
                btnConnect.style.cursor = hasCredentials ? 'pointer' : 'not-allowed';
            }
        }

        // 2. Formatear y pintar la última fecha de sincronización
        if (lastSynced) {
            const date = new Date(lastSynced);
            
            // Formato corto para el header (ej. 26/05 08:30)
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const shortStr = `Sync: ${day}/${month} ${hours}:${minutes}`;
            
            if (statusText) statusText.innerText = shortStr;

            // Formato largo para el modal
            const options = { 
                day: 'numeric', 
                month: 'long', 
                year: 'numeric', 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit' 
            };
            const longStr = date.toLocaleDateString('es-ES', options);
            if (lastSyncTime) lastSyncTime.innerText = longStr;
        } else {
            if (statusText) statusText.innerText = 'Sin Sincronizar';
            if (lastSyncTime) lastSyncTime.innerText = 'Nunca';
        }
    },

    // --- LÓGICA ORIGINAL DE IMPORTACIÓN/EXPORTACIÓN DE CSV (Reubicada) ---
    handleLocalFile(event) {
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

        if (!confirm('⚠️ COPIA DE SEGURIDAD LOCAL: ¿Deseas exportar una copia de seguridad consolidada de TODOS tus perfiles financieros en un archivo CSV?')) return;

        let csvContent = "";
        
        State.profilesState.profiles.forEach(p => {
            csvContent += `@@@ PROFILE_START | ${p.id} | ${p.name} @@@\n\n`;
            
            csvContent += "### AJUSTES_SISTEMA ###\nBaseCurrency,ExchangeRates\n";
            csvContent += `${p.db.settings.baseCurrency},"${JSON.stringify(p.db.settings.exchangeRates).replace(/"/g, '""')}"\n\n`;

            csvContent += "### BLOQUE_CUENTAS ###\nid,name,currency,balance,type,color,budget\n";
            p.db.accounts.forEach(a => { 
                csvContent += `${a.id},"${a.name}",${a.currency},${a.balance},${a.type},${a.color || ''},${a.budget || 0}\n`; 
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
        console.log("CSV: Copia de seguridad local exportada con éxito.");
    },

    async parseCSV(text) {
        // Eliminar BOM (Byte Order Mark) si existe — se añade automáticamente al exportar
        text = text.replace(/^\uFEFF/, '');

        if (!text.includes('### BLOQUE_CUENTAS ###') && !text.includes('###BLOQUE_CUENTAS###')) {
            alert("Error: El archivo no tiene el formato de backup correcto. Asegúrate de exportar desde esta misma aplicación usando el botón 'Exportar CSV'.");
            return;
        }

        if (!confirm("⚠️ ADVERTENCIA CRÍTICA: Importar esta copia de seguridad sobrescribirá TODOS tus perfiles y datos financieros actuales de forma irreversible. ¿Confirmas esta acción?")) {
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

            const parseId = (id) => {
                if (!id || id === '' || id === 'undefined') return null;
                return isNaN(Number(id)) ? id : Number(id);
            };
            const parseVal = (v) => parseFloat(String(v || '0').replace(',', '.')) || 0;

            switch (mode) {
                case '### AJUSTES_SISTEMA ###':
                    if (cols[0] !== 'BaseCurrency' && cols[0] !== '### AJUSTES_SISTEMA ###') {
                        db.settings.baseCurrency = cols[0];
                        try { db.settings.exchangeRates = JSON.parse(cols[1]); } catch(e){}
                    }
                    break;
                case '### BLOQUE_CUENTAS ###':
                    if (cols[0] !== 'id' && cols[0] !== '### BLOQUE_CUENTAS ###' && cols[0] !== '') {
                        db.accounts.push({
                            id: parseId(cols[0]), name: cols[1], currency: cols[2],
                            balance: parseVal(cols[3]), type: cols[4], color: cols[5] || '',
                            budget: cols[6] !== undefined ? parseVal(cols[6]) : 0
                        });
                    }
                    break;
                case '### BLOQUE_CATEGORIAS ###':
                    if (cols[0] !== 'id' && cols[0] !== '### BLOQUE_CATEGORIAS ###' && cols[0] !== '') {
                        db.categories.push({
                            id: parseId(cols[0]), name: cols[1], type: cols[2],
                            budget: parseVal(cols[3]), visual_color: cols[4],
                            icon: cols[5], subtype: cols[6] || 'variable'
                        });
                    }
                    break;
                case '### BLOQUE_METAS ###':
                    if (cols[0] !== 'id' && cols[0] !== '### BLOQUE_METAS ###' && cols[0] !== '') {
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
                    if (cols[0] !== 'id' && cols[0] !== '### BLOQUE_TRANSACCIONES ###' && cols[0] !== '') {
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
                                notes: cols[10] || '',
                                foreign_account_name: cols[11] || '',
                                is_cross_profile: cols[12] === 'true',
                                cross_link_id: cols[13] || null,
                                target_profile_id: cols[14] || null
                            });
                        }
                    }
                    break;
            }
        }

        if (profiles.length > 0) {
            await State.importData(profiles);
            alert(`¡Éxito! Se han importado de forma local ${profiles.length} perfil(es) con todos sus datos financieros.`);
            location.reload(); // Recargar para aplicar y renderizar
        }
    }
};
