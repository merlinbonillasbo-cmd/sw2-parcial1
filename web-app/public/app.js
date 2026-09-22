document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const authSection = document.getElementById('authSection');
  const mainSection = document.getElementById('mainSection');
  const formLogin = document.getElementById('formLogin');
  const formRegister = document.getElementById('formRegister');
  const tabAuthLogin = document.getElementById('tabAuthLogin');
  const tabAuthRegister = document.getElementById('tabAuthRegister');
  const authError = document.getElementById('authError');
  const userNameBadge = document.getElementById('userNameBadge');
  const btnLogout = document.getElementById('btnLogout');
  const activeFileName = document.getElementById('activeFileName');

  // Token Management
  let authToken = localStorage.getItem('studio_case_token');
  let currentUser = null;

  function setAuthToken(token, user) {
    authToken = token;
    currentUser = user;
    if (token) {
      localStorage.setItem('studio_case_token', token);
      if (user) localStorage.setItem('studio_case_user', JSON.stringify(user));
      showMainApp();
    } else {
      localStorage.removeItem('studio_case_token');
      localStorage.removeItem('studio_case_user');
      showAuthScreen();
    }
  }

  function showAuthScreen() {
    authSection.style.display = 'flex';
    mainSection.style.display = 'none';
    authError.style.display = 'none';
  }

  function showMainApp() {
    authSection.style.display = 'none';
    mainSection.style.display = 'block';

    const cachedUser = localStorage.getItem('studio_case_user');
    if (cachedUser) {
      const user = JSON.parse(cachedUser);
      userNameBadge.textContent = `👤 ${user.nombre}`;
    }
    loadHistory();
  }

  // Auth Tabs Toggle
  tabAuthLogin.addEventListener('click', () => {
    tabAuthLogin.classList.add('active');
    tabAuthRegister.classList.remove('active');
    formLogin.style.display = 'flex';
    formRegister.style.display = 'none';
    authError.style.display = 'none';
  });

  tabAuthRegister.addEventListener('click', () => {
    tabAuthRegister.classList.add('active');
    tabAuthLogin.classList.remove('active');
    formRegister.style.display = 'flex';
    formLogin.style.display = 'none';
    authError.style.display = 'none';
  });

  // Login Submit
  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    authError.style.display = 'none';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (data.success) {
        setAuthToken(data.token, data.user);
      } else {
        authError.textContent = data.error || 'Error al iniciar sesión';
        authError.style.display = 'block';
      }
    } catch (err) {
      authError.textContent = 'Error de conexión con el servidor.';
      authError.style.display = 'block';
    }
  });

  // Register Submit
  formRegister.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = document.getElementById('regNombre').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    authError.style.display = 'none';

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, email, password }),
      });
      const data = await res.json();

      if (data.success) {
        setAuthToken(data.token, data.user);
      } else {
        authError.textContent = data.error || 'Error al registrar usuario';
        authError.style.display = 'block';
      }
    } catch (err) {
      authError.textContent = 'Error de conexión con el servidor.';
      authError.style.display = 'block';
    }
  });

  btnLogout.addEventListener('click', () => setAuthToken(null, null));

  if (authToken) {
    showMainApp();
  } else {
    showAuthScreen();
  }

  async function fetchWithAuth(url, options = {}) {
    options.headers = options.headers || {};
    if (authToken) {
      options.headers['Authorization'] = `Bearer ${authToken}`;
    }

    const res = await fetch(url, options);
    if (res.status === 401 || res.status === 403) {
      setAuthToken(null, null);
      throw new Error('Sesión expirada. Inicia sesión de nuevo.');
    }
    return res;
  }

  // Navigation Tabs
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      tabBtns.forEach((b) => b.classList.remove('active'));
      tabContents.forEach((c) => c.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(targetTab).classList.add('active');

      if (targetTab === 'tab-archivos') {
        loadHistory();
      }
    });
  });

  // GEMINI AI CHAT LOGIC
  const chatBox = document.getElementById('chatBox');
  const formChatAi = document.getElementById('formChatAi');
  const aiPromptInput = document.getElementById('aiPromptInput');
  const btnSendAi = document.getElementById('btnSendAi');
  const jdlText = document.getElementById('jdlText');

  formChatAi.addEventListener('submit', async (e) => {
    e.preventDefault();
    const prompt = aiPromptInput.value.trim();
    if (!prompt) return;

    // Agregar mensaje de usuario al chat
    appendChatMessage('user', prompt);
    aiPromptInput.value = '';
    btnSendAi.disabled = true;
    btnSendAi.textContent = '⏳ Pensando...';

    // Agregar indicador de cargando de la IA
    const loadingId = appendChatMessage('ai', 'Pensando arquitectura JDL y diseñando entidades...');

    try {
      const res = await fetchWithAuth('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      const data = await res.json();
      removeChatMessage(loadingId);

      if (data.success) {
        appendAiResponse(data.reply, data.jdlCode);
      } else {
        appendChatMessage('ai', `❌ Error de la IA: ${data.error}`);
      }
    } catch (err) {
      removeChatMessage(loadingId);
      appendChatMessage('ai', `❌ Error de red: ${err.message}`);
    } finally {
      btnSendAi.disabled = false;
      btnSendAi.textContent = '✨ Consultar IA';
    }
  });

  // OLLAMA LLAMA3 CHAT LOGIC
  const ollamaChatBox = document.getElementById('ollamaChatBox');
  const formOllamaChat = document.getElementById('formOllamaChat');
  const ollamaPromptInput = document.getElementById('ollamaPromptInput');
  const btnSendOllama = document.getElementById('btnSendOllama');

  if (formOllamaChat) {
    formOllamaChat.addEventListener('submit', async (e) => {
      e.preventDefault();
      const prompt = ollamaPromptInput.value.trim();
      if (!prompt) return;

      appendOllamaChatMessage('user', prompt);
      ollamaPromptInput.value = '';
      btnSendOllama.disabled = true;
      btnSendOllama.textContent = '⏳ Ollama Llama 3 pensando...';

      const loadingId = appendOllamaChatMessage('ai', 'Procesando especificaciones con Ollama (llama3)...');

      try {
        const res = await fetchWithAuth('/api/ai/ollama-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
        });

        const data = await res.json();
        removeChatMessage(loadingId);

        if (data.success) {
          appendOllamaAiResponse(data.reply, data.jdlCode);
        } else {
          appendOllamaChatMessage('ai', `❌ Error de Ollama: ${data.error}`);
        }
      } catch (err) {
        removeChatMessage(loadingId);
        appendOllamaChatMessage('ai', `❌ Error de conexión: ${err.message}`);
      } finally {
        btnSendOllama.disabled = false;
        btnSendOllama.textContent = '⚡ Generar JDL';
      }
    });
  }

  function appendOllamaChatMessage(sender, text) {
    const msgId = `msg_ollama_${Date.now()}`;
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${sender === 'user' ? 'user-message' : 'ai-message'}`;
    msgDiv.id = msgId;

    msgDiv.innerHTML = `
      <div class="msg-avatar">${sender === 'user' ? '👤' : '🦙'}</div>
      <div class="msg-content">
        <p>${escapeHtml(text)}</p>
      </div>
    `;

    if (ollamaChatBox) {
      ollamaChatBox.appendChild(msgDiv);
      ollamaChatBox.scrollTop = ollamaChatBox.scrollHeight;
    }
    return msgId;
  }

  function appendOllamaAiResponse(replyText, jdlCode) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message ai-message';

    let html = `
      <div class="msg-avatar">🦙</div>
      <div class="msg-content">
    `;

    if (jdlCode) {
      html += `
        <p><strong>Código JDL Generado por Ollama Llama 3:</strong></p>
        <div class="jdl-code-box">${escapeHtml(jdlCode)}</div>
        <div class="chat-action-bar">
          <button type="button" class="btn btn-secondary btn-small btn-copy-jdl">
            📋 Copiar JDL
          </button>
          <button type="button" class="btn btn-primary btn-small btn-use-ollama-jdl" data-jdl="${encodeURIComponent(jdlCode)}">
            ⚡ Usar este JDL en Editor / Generar Software
          </button>
        </div>
      `;
    } else {
      html += `<p>${escapeHtml(replyText).replace(/\n/g, '<br>')}</p>`;
    }

    html += `</div>`;
    msgDiv.innerHTML = html;

    if (ollamaChatBox) {
      ollamaChatBox.appendChild(msgDiv);
      ollamaChatBox.scrollTop = ollamaChatBox.scrollHeight;
    }

    const btnUse = msgDiv.querySelector('.btn-use-ollama-jdl');
    if (btnUse) {
      btnUse.addEventListener('click', () => {
        const code = decodeURIComponent(btnUse.getAttribute('data-jdl'));
        jdlText.value = code;

        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
        document.querySelector('[data-tab="tab-jdl"]').classList.add('active');
        document.getElementById('tab-jdl').classList.add('active');

        alert('✅ Código JDL cargado en el editor. ¡Haz clic en "Generar Software desde JDL" para compilarlo!');
      });
    }

    const btnCopy = msgDiv.querySelector('.btn-copy-jdl');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        navigator.clipboard.writeText(jdlCode);
        btnCopy.textContent = '✅ ¡Copiado!';
        setTimeout(() => { btnCopy.textContent = '📋 Copiar JDL'; }, 2000);
      });
    }
  }

  // VISION AI DIAGRAM TO JDL LOGIC
  const visionDropZone = document.getElementById('visionDropZone');
  const visionFileInput = document.getElementById('visionFileInput');
  const formVisionAi = document.getElementById('formVisionAi');
  const visionPreviewContainer = document.getElementById('visionPreviewContainer');
  const visionImagePreview = document.getElementById('visionImagePreview');
  const btnAnalyzeVision = document.getElementById('btnAnalyzeVision');
  const visionResultSection = document.getElementById('visionResultSection');
  const visionJdlResult = document.getElementById('visionJdlResult');
  const btnCopyVisionJdl = document.getElementById('btnCopyVisionJdl');
  const btnUseVisionJdl = document.getElementById('btnUseVisionJdl');

  let selectedVisionFile = null;

  if (visionDropZone && visionFileInput) {
    visionDropZone.addEventListener('click', () => visionFileInput.click());

    visionFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleVisionFile(e.target.files[0]);
      }
    });

    visionDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      visionDropZone.classList.add('drag-over');
    });

    visionDropZone.addEventListener('dragleave', () => {
      visionDropZone.classList.remove('drag-over');
    });

    visionDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      visionDropZone.classList.remove('drag-over');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleVisionFile(e.dataTransfer.files[0]);
      }
    });
  }

  function handleVisionFile(file) {
    if (!file.type.startsWith('image/')) {
      alert('Por favor selecciona un archivo de imagen válido (PNG, JPG, WEBP).');
      return;
    }
    selectedVisionFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      visionImagePreview.src = e.target.result;
      visionPreviewContainer.style.display = 'block';
      visionResultSection.style.display = 'none';
    };
    reader.readAsDataURL(file);
  }

  if (formVisionAi) {
    formVisionAi.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!selectedVisionFile) {
        alert('Por favor selecciona o arrastra la foto de tu diagrama de clases.');
        return;
      }

      btnAnalyzeVision.disabled = true;
      btnAnalyzeVision.textContent = '⏳ IA Visión Analizando Diagrama...';

      const formData = new FormData();
      formData.append('diagramImage', selectedVisionFile);

      try {
        const res = await fetchWithAuth('/api/ai/vision-jdl', {
          method: 'POST',
          body: formData,
        });

        const data = await res.json();
        if (data.success && data.jdlCode) {
          visionJdlResult.value = data.jdlCode;
          visionResultSection.style.display = 'block';
          visionResultSection.scrollIntoView({ behavior: 'smooth' });
        } else {
          alert(`❌ Error al analizar diagrama: ${data.error || 'No se pudo detectar código JDL'}`);
        }
      } catch (err) {
        alert(`❌ Error de conexión: ${err.message}`);
      } finally {
        btnAnalyzeVision.disabled = false;
        btnAnalyzeVision.textContent = '✨ Analizar Diagrama y Generar JDL';
      }
    });
  }

  if (btnCopyVisionJdl) {
    btnCopyVisionJdl.addEventListener('click', () => {
      navigator.clipboard.writeText(visionJdlResult.value);
      btnCopyVisionJdl.textContent = '✅ ¡Copiado!';
      setTimeout(() => { btnCopyVisionJdl.textContent = '📋 Copiar JDL'; }, 2000);
    });
  }

  if (btnSendVisionToChat) {
    btnSendVisionToChat.addEventListener('click', () => {
      const code = visionJdlResult.value;
      if (!code) return;

      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
      document.querySelector('[data-tab="tab-chat"]').classList.add('active');
      document.getElementById('tab-chat').classList.add('active');

      if (ollamaPromptInput) {
        ollamaPromptInput.value = `Tengo este código JDL detectado de mi diagrama: \n${code}\n\nOptimízalo y genera el JDL final.`;
        ollamaPromptInput.focus();
      }
    });
  }

  if (btnUseVisionJdl) {
    btnUseVisionJdl.addEventListener('click', () => {
      const code = visionJdlResult.value;
      if (!code) return;
      jdlText.value = code;

      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
      document.querySelector('[data-tab="tab-jdl"]').classList.add('active');
      document.getElementById('tab-jdl').classList.add('active');

      alert('✅ Código JDL cargado en el editor. ¡Haz clic en "Generar Software desde JDL" para compilarlo!');
    });
  }

  function appendChatMessage(sender, text) {
    const msgId = `msg_${Date.now()}`;
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${sender === 'user' ? 'user-message' : 'ai-message'}`;
    msgDiv.id = msgId;

    msgDiv.innerHTML = `
      <div class="msg-avatar">${sender === 'user' ? '👤' : '🤖'}</div>
      <div class="msg-content">
        <p>${escapeHtml(text)}</p>
      </div>
    `;

    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
    return msgId;
  }

  function removeChatMessage(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  function appendAiResponse(replyText, jdlCode) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message ai-message';

    let formattedText = escapeHtml(replyText).replace(/```jdl[\s\S]*?```/gi, '').replace(/```[\s\S]*?```/gi, '');

    let html = `
      <div class="msg-avatar">🤖</div>
      <div class="msg-content">
        <p>${formattedText.replace(/\n/g, '<br>')}</p>
    `;

    if (jdlCode) {
      html += `
        <div class="jdl-code-box">${escapeHtml(jdlCode)}</div>
        <div class="chat-action-bar">
          <a href="https://www.jhipster.tech/jdl-studio/" target="_blank" class="btn btn-secondary btn-small">
            🔗 Probar código en JDL Studio
          </a>
          <button type="button" class="btn btn-primary btn-small btn-use-jdl" data-jdl="${encodeURIComponent(jdlCode)}">
            ⚡ Usar este JDL en Generador
          </button>
        </div>
      `;
    }

    html += `</div>`;
    msgDiv.innerHTML = html;

    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;

    // Listener para el botón "Usar este JDL"
    const btnUse = msgDiv.querySelector('.btn-use-jdl');
    if (btnUse) {
      btnUse.addEventListener('click', () => {
        const code = decodeURIComponent(btnUse.getAttribute('data-jdl'));
        jdlText.value = code;

        // Cambiar a la pestaña del Editor JDL
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
        document.querySelector('[data-tab="tab-jdl"]').classList.add('active');
        document.getElementById('tab-jdl').classList.add('active');

        alert('✅ Código JDL cargado en el editor. ¡Haz clic en "Generar Software desde JDL" para compilarlo!');
      });
    }
  }

  function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Dynamic Entities Manager
  const entidadesContainer = document.getElementById('entidadesContainer');
  const btnAddEntidad = document.getElementById('btnAddEntidad');
  let entidadCounter = 0;

  function createEntidadCard(nombre = '') {
    entidadCounter++;
    const entId = `entidad_${entidadCounter}`;

    const entDiv = document.createElement('div');
    entDiv.className = 'entidad-item';
    entDiv.id = entId;

    entDiv.innerHTML = `
      <div class="entidad-header">
        <input type="text" class="entidad-nombre" placeholder="Nombre Entidad (ej. Paciente)" value="${nombre}" required>
        <button type="button" class="btn btn-secondary btn-small btn-add-campo">➕ Campo</button>
        <button type="button" class="btn btn-danger btn-small btn-del-entidad">🗑️ Eliminar</button>
      </div>
      <div class="campos-list"></div>
    `;

    entidadesContainer.appendChild(entDiv);

    const camposList = entDiv.querySelector('.campos-list');
    const btnAddCampo = entDiv.querySelector('.btn-add-campo');
    const btnDelEntidad = entDiv.querySelector('.btn-del-entidad');

    function createCampoRow(nombreCampo = '', tipo = 'String', requerido = false) {
      const rowDiv = document.createElement('div');
      rowDiv.className = 'campo-row';
      rowDiv.innerHTML = `
        <input type="text" class="campo-nombre" placeholder="Nombre campo (ej. precio)" value="${nombreCampo}" required>
        <select class="campo-tipo">
          <option value="String" ${tipo === 'String' ? 'selected' : ''}>String</option>
          <option value="Integer" ${tipo === 'Integer' ? 'selected' : ''}>Integer</option>
          <option value="Long" ${tipo === 'Long' ? 'selected' : ''}>Long</option>
          <option value="BigDecimal" ${tipo === 'BigDecimal' ? 'selected' : ''}>BigDecimal</option>
          <option value="Boolean" ${tipo === 'Boolean' ? 'selected' : ''}>Boolean</option>
          <option value="LocalDate" ${tipo === 'LocalDate' ? 'selected' : ''}>LocalDate</option>
          <option value="Instant" ${tipo === 'Instant' ? 'selected' : ''}>Instant</option>
        </select>
        <label style="display: flex; align-items: center; gap: 0.3rem; font-size: 0.85rem; cursor: pointer;">
          <input type="checkbox" class="campo-requerido" ${requerido ? 'checked' : ''}> Requerido
        </label>
        <button type="button" class="btn btn-danger btn-small btn-del-campo">&times;</button>
      `;

      rowDiv.querySelector('.btn-del-campo').addEventListener('click', () => rowDiv.remove());
      camposList.appendChild(rowDiv);
    }

    btnAddCampo.addEventListener('click', () => createCampoRow());
    btnDelEntidad.addEventListener('click', () => entDiv.remove());

    createCampoRow('nombre', 'String', true);
  }

  btnAddEntidad.addEventListener('click', () => createEntidadCard());
  createEntidadCard('Paciente');
  createEntidadCard('CitaMedica');

  // Submit Form Indicaciones
  const formIndicaciones = document.getElementById('formIndicaciones');
  formIndicaciones.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nombreProyecto = document.getElementById('nombreProyecto').value;
    const clientFramework = document.getElementById('clientFramework').value;
    const prodDatabaseType = document.getElementById('prodDatabaseType').value;
    const authenticationType = document.getElementById('authenticationType').value;
    const buildTool = document.getElementById('buildTool').value;

    const entidades = [];
    document.querySelectorAll('.entidad-item').forEach((entCard) => {
      const nombreEnt = entCard.querySelector('.entidad-nombre').value;
      if (!nombreEnt) return;

      const campos = [];
      entCard.querySelectorAll('.campo-row').forEach((row) => {
        const nombreCampo = row.querySelector('.campo-nombre').value;
        const tipo = row.querySelector('.campo-tipo').value;
        const requerido = row.querySelector('.campo-requerido').checked;
        if (nombreCampo) {
          campos.push({ nombre: nombreCampo, tipo, requerido });
        }
      });

      entidades.push({ nombre: nombreEnt, campos });
    });

    const payload = {
      nombreProyecto,
      clientFramework,
      prodDatabaseType,
      authenticationType,
      buildTool,
      entidades,
    };

    openModal('Iniciando Generación por Especificaciones...');

    try {
      const res = await fetchWithAuth('/api/generate/indicaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        pollStatus(data.generation.id);
      } else {
        showErrorInModal(data.error);
      }
    } catch (err) {
      showErrorInModal(err.message);
    }
  });

  // Drag and Drop / Upload JDL
  const dropZone = document.getElementById('dropZone');
  const jdlFileInput = document.getElementById('jdlFileInput');

  dropZone.addEventListener('click', () => jdlFileInput.click());
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  jdlFileInput.addEventListener('change', () => {
    if (jdlFileInput.files.length > 0) {
      handleFile(jdlFileInput.files[0]);
    }
  });

  function handleFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      jdlText.value = e.target.result;
    };
    reader.readAsText(file);
  }

  // Submit Form JDL
  const formJdl = document.getElementById('formJdl');
  formJdl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = jdlText.value.trim();
    if (!text) {
      alert('Por favor escribe o sube un archivo JDL válido.');
      return;
    }

    openModal('Iniciando Generación desde JDL...');

    try {
      const res = await fetchWithAuth('/api/generate/jdl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jdlText: text }),
      });

      const data = await res.json();
      if (data.success) {
        pollStatus(data.generation.id);
      } else {
        showErrorInModal(data.error);
      }
    } catch (err) {
      showErrorInModal(err.message);
    }
  });

  // History & Status Polling
  const historyTableBody = document.getElementById('historyTableBody');
  const btnCreateFileModal = document.getElementById('btnCreateFileModal');

  if (btnCreateFileModal) {
    btnCreateFileModal.addEventListener('click', () => {
      const name = prompt('Ingresa el nombre para tu nuevo Archivo / Proyecto JDL:', 'NuevoProyecto.jdl');
      if (name) {
        activeFileName.textContent = name.endsWith('.jdl') ? name : `${name}.jdl`;
        alert(`✅ Archivo "${activeFileName.textContent}" creado y seleccionado como activo.`);
      }
    });
  }

  async function loadHistory() {
    if (!authToken) return;
    try {
      const res = await fetchWithAuth('/api/history');
      const data = await res.json();

      if (data.success) {
        renderHistoryTable(data.history);
      }
    } catch (err) {
      console.error('Error cargando historial:', err);
    }
  }

  function renderHistoryTable(rows) {
    if (!rows || rows.length === 0) {
      historyTableBody.innerHTML = `<tr><td colspan="6" class="text-center">No tienes archivos de proyecto generados aún.</td></tr>`;
      return;
    }

    // Seleccionar el primero como activo si existe
    if (rows[0] && activeFileName) {
      activeFileName.textContent = `${rows[0].nombre_proyecto}.jdl`;
    }

    historyTableBody.innerHTML = rows
      .map((row) => {
        const dateStr = new Date(row.fecha_creacion).toLocaleString('es-ES');
        const badgeClass = `badge-${row.estado}`;

        return `
          <tr>
            <td>#${row.id}</td>
            <td><strong>${row.nombre_proyecto}.jdl</strong></td>
            <td><code>${row.tipo_generacion}</code></td>
            <td><span class="badge ${badgeClass}">${row.estado}</span></td>
            <td>${dateStr}</td>
            <td>
              ${
                row.estado === 'completado'
                  ? `<a href="/api/download/${row.id}" class="btn btn-primary btn-small">📦 Descargar .ZIP</a>`
                  : `<button class="btn btn-secondary btn-small" onclick="viewLogModal(${row.id})">🔍 Ver Logs</button>`
              }
            </td>
          </tr>
        `;
      })
      .join('');
  }

  // Modal logic
  const logModal = document.getElementById('logModal');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalSpinner = document.getElementById('modalSpinner');
  const modalLogViewer = document.getElementById('modalLogViewer');
  const modalFooter = document.getElementById('modalFooter');

  btnCloseModal.addEventListener('click', () => logModal.classList.remove('active'));

  function openModal(title) {
    modalTitle.textContent = title;
    modalSpinner.style.display = 'flex';
    modalLogViewer.textContent = 'Iniciando proceso de generación...';
    modalFooter.innerHTML = '';
    logModal.classList.add('active');
  }

  function showErrorInModal(msg) {
    modalSpinner.style.display = 'none';
    modalLogViewer.textContent = `Error: ${msg}`;
  }

  async function pollStatus(genId) {
    let interval = setInterval(async () => {
      try {
        const res = await fetchWithAuth(`/api/status/${genId}`);
        const data = await res.json();

        if (data.success) {
          const gen = data.generation;
          modalLogViewer.textContent = gen.log_output || 'Generando código fuente... Por favor espera.';

          if (gen.estado === 'completado') {
            clearInterval(interval);
            modalSpinner.style.display = 'none';
            modalTitle.textContent = '✅ ¡Software Creado Exitosamente!';
            modalFooter.innerHTML = `<a href="/api/download/${genId}" class="btn btn-primary btn-large">📦 Descargar Proyecto (.ZIP)</a>`;
            loadHistory();
          } else if (gen.estado === 'error') {
            clearInterval(interval);
            modalSpinner.style.display = 'none';
            modalTitle.textContent = '❌ Error al Generar';
            loadHistory();
          }
        }
      } catch (err) {
        console.error('Error polling status:', err);
      }
    }, 2000);
  }

  window.viewLogModal = async function (id) {
    openModal(`Logs del Proyecto #${id}`);
    try {
      const res = await fetchWithAuth(`/api/status/${id}`);
      const data = await res.json();
      if (data.success) {
        const gen = data.generation;
        modalSpinner.style.display = 'none';
        modalLogViewer.textContent = gen.log_output || 'Sin registros de log.';
        if (gen.estado === 'completado') {
          modalFooter.innerHTML = `<a href="/api/download/${id}" class="btn btn-primary btn-large">📦 Descargar Proyecto (.ZIP)</a>`;
        }
      }
    } catch (err) {
      showErrorInModal(err.message);
    }
  };
});
