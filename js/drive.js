import { State } from './state.js';

export const DriveService = {
    // Configuración persistida en localStorage
    STORAGE_KEYS: {
        CLIENT_ID: 'finance_drive_client_id',
        AUTO_SYNC: 'finance_drive_auto_sync',
        CONNECTED: 'finance_drive_connected',
        USER_EMAIL: 'finance_drive_user_email',
        LAST_SYNCED: 'finance_drive_last_synced'
    },

    // Credenciales en tiempo de ejecución (sessionStorage para seguridad básica)
    accessToken: sessionStorage.getItem('finance_drive_access_token') || null,
    tokenClient: null,
    isInitializingGis: false,

    // Obtener valores guardados
    getClientId() {
        return localStorage.getItem(this.STORAGE_KEYS.CLIENT_ID) || '';
    },

    setClientId(value) {
        localStorage.setItem(this.STORAGE_KEYS.CLIENT_ID, value.trim());
    },

    getAutoSync() {
        return localStorage.getItem(this.STORAGE_KEYS.AUTO_SYNC) === 'true';
    },

    setAutoSync(value) {
        localStorage.setItem(this.STORAGE_KEYS.AUTO_SYNC, value ? 'true' : 'false');
    },

    isConnected() {
        return localStorage.getItem(this.STORAGE_KEYS.CONNECTED) === 'true';
    },

    setConnected(value) {
        localStorage.setItem(this.STORAGE_KEYS.CONNECTED, value ? 'true' : 'false');
    },

    getUserEmail() {
        return localStorage.getItem(this.STORAGE_KEYS.USER_EMAIL) || '';
    },

    setUserEmail(value) {
        localStorage.setItem(this.STORAGE_KEYS.USER_EMAIL, value);
    },

    getLastSynced() {
        return localStorage.getItem(this.STORAGE_KEYS.LAST_SYNCED) || null;
    },

    setLastSynced(value) {
        localStorage.setItem(this.STORAGE_KEYS.LAST_SYNCED, value);
    },

    /**
     * Inicializa el cliente de Google Identity Services (GIS)
     */
    async initGis() {
        if (this.tokenClient) return this.tokenClient;
        if (typeof google === 'undefined') {
            throw new Error("El SDK de Google no se ha cargado. Comprueba tu conexión a internet.");
        }

        const clientId = this.getClientId();
        if (!clientId) {
            throw new Error("Por favor, introduce un Google OAuth Client ID válido en la configuración.");
        }

        return new Promise((resolve) => {
            // El scope 'drive.appdata' da acceso únicamente a una carpeta de aplicación oculta
            // 'userinfo.email' es para leer el correo del usuario conectado
            this.tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email',
                callback: (tokenResponse) => {
                    if (tokenResponse.error) {
                        console.error("Error en autorización de Google:", tokenResponse.error);
                        return;
                    }
                    this.accessToken = tokenResponse.access_token;
                    sessionStorage.setItem('finance_drive_access_token', this.accessToken);
                    this.setConnected(true);
                    
                    // Disparar evento tras obtener token con éxito
                    if (this.onAuthSuccessCallback) {
                        this.onAuthSuccessCallback(this.accessToken);
                    }
                }
            });
            resolve(this.tokenClient);
        });
    },

    /**
     * Pide permiso al usuario abriendo el popup oficial de Google
     */
    async requestToken() {
        await this.initGis();
        return new Promise((resolve, reject) => {
            this.onAuthSuccessCallback = async (token) => {
                try {
                    const email = await this.fetchUserEmail(token);
                    this.setUserEmail(email);
                    resolve(token);
                } catch (e) {
                    reject(e);
                }
            };
            this.tokenClient.requestAccessToken({ prompt: 'consent' });
        });
    },

    /**
     * Obtiene el email del usuario usando su access token
     */
    async fetchUserEmail(token) {
        const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error("No se pudo obtener la información de perfil de Google.");
        const data = await response.json();
        return data.email;
    },

    /**
     * Cierra la sesión de Google Drive en la aplicación
     */
    disconnect() {
        this.accessToken = null;
        sessionStorage.removeItem('finance_drive_access_token');
        this.setConnected(false);
        this.setUserEmail('');
        this.setLastSynced('');
        if (this.onStatusChange) this.onStatusChange();
    },

    /**
     * Realiza peticiones Fetch seguras con reintento automático si el token expira
     */
    async authenticatedFetch(url, options = {}) {
        if (!this.accessToken) {
            if (this.isConnected()) {
                // Si estaba conectado pero no hay token en memoria, lo solicitamos
                await this.requestToken();
            } else {
                throw new Error("No hay una cuenta de Google conectada.");
            }
        }

        if (!options.headers) options.headers = {};
        options.headers['Authorization'] = `Bearer ${this.accessToken}`;

        let response = await fetch(url, options);

        // Si da 401 (Unauthorized), el token probablemente expiró. Intentamos refrescarlo.
        if (response.status === 401) {
            console.warn("Token de acceso expirado, solicitando uno nuevo...");
            await this.requestToken();
            options.headers['Authorization'] = `Bearer ${this.accessToken}`;
            response = await fetch(url, options);
        }

        return response;
    },

    /**
     * Busca si el archivo de base de datos ya existe en la carpeta oculta appDataFolder
     */
    async searchBackupFile() {
        const query = encodeURIComponent("name = 'finance_profiles_v2.json' and 'appDataFolder' in parents and trashed = false");
        const url = `https://www.googleapis.com/drive/3/files?spaces=appDataFolder&q=${query}&fields=files(id,name,modifiedTime)`;
        
        const response = await this.authenticatedFetch(url);
        if (!response.ok) throw new Error("Error buscando copias de seguridad en Google Drive.");
        
        const data = await response.json();
        return data.files && data.files.length > 0 ? data.files[0] : null;
    },

    /**
     * Descarga el contenido del archivo a partir de su ID de archivo
     */
    async downloadBackupFile(fileId) {
        const url = `https://www.googleapis.com/drive/3/files/${fileId}?alt=media`;
        const response = await this.authenticatedFetch(url);
        if (!response.ok) throw new Error("Error descargando los datos de Google Drive.");
        return await response.json();
    },

    /**
     * Sube un archivo nuevo a la carpeta oculta appDataFolder
     */
    async createBackupFile(stateData) {
        const url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
        
        const metadata = {
            name: 'finance_profiles_v2.json',
            parents: ['appDataFolder']
        };

        const boundary = 'foo_bar_boundary';
        const delimiter = `\r\n--${boundary}\r\n`;
        const closeDelimiter = `\r\n--${boundary}--`;

        const multipartBody = 
            delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(stateData) +
            closeDelimiter;

        const response = await this.authenticatedFetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': `multipart/related; boundary=${boundary}`
            },
            body: multipartBody
        });

        if (!response.ok) throw new Error("Error creando el archivo de copia de seguridad en Google Drive.");
        return await response.json();
    },

    /**
     * Sobreescribe un archivo existente en Google Drive
     */
    async updateBackupFile(fileId, stateData) {
        const url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
        
        const response = await this.authenticatedFetch(url, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json; charset=UTF-8'
            },
            body: JSON.stringify(stateData)
        });

        if (!response.ok) throw new Error("Error actualizando la copia de seguridad en Google Drive.");
        return await response.json();
    },

    /**
     * Orquesta la sincronización bidireccional basada en lastModified
     * @param {boolean} force - Si es true, el usuario inició la acción manualmente
     */
    async sync(force = false) {
        try {
            if (!this.getClientId()) {
                if (force) alert("Por favor, introduce tu Google OAuth Client ID antes de sincronizar.");
                return false;
            }

            // Asegurar que tenemos un token
            if (!this.accessToken) {
                if (this.isConnected()) {
                    // Si el usuario ya estaba conectado previamente en otras sesiones, intentar reconexión silenciosa o mediante popup rápido
                    await this.requestToken();
                } else {
                    if (force) await this.requestToken();
                    else return false;
                }
            }

            // Obtener el estado local actual consolidado
            const localState = State.profilesState;
            if (!localState) {
                throw new Error("No se pudo leer el estado financiero local.");
            }

            // Garantizar que el estado local tiene una fecha de última modificación
            if (!localState.lastModified) {
                localState.lastModified = new Date().toISOString();
                await State.save();
            }

            // 1. Buscar si hay archivo en Drive
            const remoteFileMeta = await this.searchBackupFile();

            if (!remoteFileMeta) {
                // CASO 1: No existe copia en Drive. Subir el local actual.
                console.log("No se encontró copia en Google Drive. Subiendo base de datos local...");
                await this.createBackupFile(localState);
                
                const now = new Date().toISOString();
                this.setLastSynced(now);
                if (this.onStatusChange) this.onStatusChange();
                if (force) alert("¡Sincronización inicial exitosa! Se ha creado una copia de seguridad en tu Google Drive.");
                return true;
            }

            // 2. Descargar el archivo remoto para comparar marcas de tiempo internas
            console.log("Copia de seguridad encontrada en Drive. Descargando para comparar...");
            const remoteState = await this.downloadBackupFile(remoteFileMeta.id);

            const localTime = new Date(localState.lastModified).getTime();
            const remoteTime = new Date(remoteState.lastModified || 0).getTime();

            // Pequeño umbral de tolerancia para evitar mini diferencias de milisegundos
            const timeDiff = Math.abs(localTime - remoteTime);

            if (timeDiff < 2000) {
                // CASO 2: Sincronizado
                console.log("Los datos ya están sincronizados.");
                const now = new Date().toISOString();
                this.setLastSynced(now);
                if (this.onStatusChange) this.onStatusChange();
                if (force) alert("¡Tus finanzas ya están al día! No se requirieron transferencias.");
                return true;
            }

            if (localTime > remoteTime) {
                // CASO 3: Local es más nuevo. Subir a Drive.
                console.log("Los datos locales son más recientes. Actualizando Google Drive...");
                await this.updateBackupFile(remoteFileMeta.id, localState);
                
                const now = new Date().toISOString();
                this.setLastSynced(now);
                if (this.onStatusChange) this.onStatusChange();
                if (force) alert("¡Sincronización exitosa! Se han subido tus cambios locales a Google Drive.");
                return true;
            } else {
                // CASO 4: Nube es más nueva. Descargar y aplicar.
                console.log("Los datos en Google Drive son más recientes. Actualizando base de datos local...");
                
                if (force || confirm("⚠️ DATOS MÁS RECIENTES EN LA NUBE: Se ha detectado una versión más nueva de tus finanzas en Google Drive. ¿Deseas descargarla y sobreescribir tus datos locales?")) {
                    await State.importData(remoteState.profiles);
                    // Actualizar el activeProfileId también
                    if (remoteState.activeProfileId) {
                        State.profilesState.activeProfileId = remoteState.activeProfileId;
                        await State.save();
                    }
                    
                    const now = new Date().toISOString();
                    this.setLastSynced(now);
                    
                    alert("¡Sincronización completada! Los datos se han actualizado con la versión en la nube.");
                    location.reload(); // Recargar de manera limpia para pintar todo
                    return true;
                }
                return false;
            }
        } catch (error) {
            console.error("Error durante la sincronización con Google Drive:", error);
            if (force) alert(`Error al sincronizar: ${error.message}`);
            return false;
        }
    }
};
