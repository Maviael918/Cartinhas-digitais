const supabaseConfig = window.SUPABASE_CONFIG || {};
const SUPABASE_URL = supabaseConfig.url || "";
const SUPABASE_ANON_KEY = supabaseConfig.anonKey || "";

const isSupabaseConfigured = SUPABASE_URL.startsWith("https://") && SUPABASE_ANON_KEY.length > 40;
const supabaseClient = isSupabaseConfigured && window.supabase
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;
const APP_MODE = document.body.dataset.appMode || "combined";
const ALERT_AUDIO_SRC = "audio/soundreality-short-notification-619509.mp3";
const FAKE_CARD_MESSAGE = "Poxa, que pena! Tente novamente.";

const demoCards = [
    {
        id: "card_sol",
        number: "001",
        name: "Guardiao do Sol",
        rarity: "Rara",
        point_value: 120,
        money_value: 0,
        image_path: "cartinhas/001.png",
        qr_token: "CARD-001",
        color: "#d99b2b",
        description: "Uma carta brilhante liberada nos pontos mais movimentados da trilha."
    },
    {
        id: "card_mapa",
        number: "002",
        name: "Mapa Secreto",
        rarity: "Comum",
        point_value: 60,
        money_value: 0,
        image_path: "cartinhas/002.png",
        qr_token: "CARD-002",
        color: "#2f7fb4",
        description: "Revela pistas extras para os proximos locais do percurso."
    },
    {
        id: "card_floresta",
        number: "003",
        name: "Selo da Floresta",
        rarity: "Epica",
        point_value: 220,
        money_value: 0,
        image_path: "cartinhas/003.png",
        qr_token: "CARD-003",
        color: "#1f7a5f",
        description: "Comprova que o jogador encontrou um ponto especial escondido."
    },
    {
        id: "card_falsa",
        number: "000",
        name: "Carta falsa",
        rarity: "Comum",
        point_value: 0,
        money_value: 0,
        image_path: "",
        qr_token: "CARD-FAKE",
        color: "#64748b",
        description: "Carta sem valor. Ao escanear, o jogador recebe uma mensagem para tentar novamente.",
        is_fake: true
    }
];

const demoLocations = [
    {
        id: "loc_praca",
        name: "Praca Central",
        clue: "Procure o banco perto da fonte principal.",
        qr_token: "TESOURO-PRACA-001",
        card_id: "card_sol",
        active: true
    },
    {
        id: "loc_biblioteca",
        name: "Biblioteca",
        clue: "A pista fica perto da estante de historias locais.",
        qr_token: "TESOURO-BIBLIOTECA-002",
        card_id: "card_mapa",
        active: true
    },
    {
        id: "loc_jardim",
        name: "Jardim Sensorial",
        clue: "Siga o aroma das ervas e encontre a placa discreta.",
        qr_token: "TESOURO-JARDIM-003",
        card_id: "card_floresta",
        active: false
    }
];

const demoCardCodes = [
    { id: "code_sol_001", card_id: "card_sol", code: "ID-SOL-0001", active: true, claimed_by: null, claimed_device_id: null, claimed_at: null },
    { id: "code_mapa_001", card_id: "card_mapa", code: "ID-MAPA-0001", active: true, claimed_by: null, claimed_device_id: null, claimed_at: null },
    { id: "code_floresta_001", card_id: "card_floresta", code: "ID-FLORESTA-0001", active: true, claimed_by: null, claimed_device_id: null, claimed_at: null },
    { id: "code_falsa_001", card_id: "card_falsa", code: "FAKE-TENTE-NOVAMENTE", active: true, claimed_by: null, claimed_device_id: null, claimed_at: null }
];

const demoUsers = [
    { id: "admin-demo", name: "Administrador", email: "admin@demo.local", role: "admin", points_balance: 0 },
    { id: "player-demo", name: "Jogador Demo", email: "jogador@demo.local", role: "player", points_balance: 0 }
];

const demoSettings = {
    point_cash_rate: 0.01,
    minimum_redeem_points: 1000,
    campaign_conditions: "Encontre uma pista, leia o QR Code ou digite o codigo da carta para validar a recompensa. Trocas precisam ser aceitas pelos dois jogadores."
};

const state = {
    view: "auth",
    authMode: "login",
    user: null,
    locations: [],
    cards: [],
    inventory: [],
    users: [],
    scans: [],
    trades: [],
    housePurchases: [],
    cardCodes: [],
    settings: demoSettings,
    editingCardId: null,
    realtimeChannel: null,
    realtimeRefreshTimer: null,
    realtimeRefreshing: false,
    scanner: null,
    scannerRunning: false,
    tradeScanner: null,
    tradeScannerRunning: false,
    pendingQrToken: null,
    deviceId: getDeviceId()
};

const app = document.querySelector("#app-container");

const storage = {
    read(key, fallback) {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    },
    write(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }
};

function seedDemoData() {
    if (!storage.read("ct_cards", null)) storage.write("ct_cards", demoCards);
    if (!storage.read("ct_locations", null)) storage.write("ct_locations", demoLocations);
    if (!storage.read("ct_users", null)) storage.write("ct_users", demoUsers);
    if (!storage.read("ct_inventory", null)) storage.write("ct_inventory", []);
    if (!storage.read("ct_scans", null)) storage.write("ct_scans", []);
    if (!storage.read("ct_trades", null)) storage.write("ct_trades", []);
    if (!storage.read("ct_house_purchases", null)) storage.write("ct_house_purchases", []);
    if (!storage.read("ct_card_codes", null)) storage.write("ct_card_codes", demoCardCodes);
    if (!storage.read("ct_settings", null)) storage.write("ct_settings", demoSettings);
}

function resolveViewForUser(user) {
    if (APP_MODE === "admin") return "admin";
    if (APP_MODE === "player") return "player";
    return user?.role === "admin" ? "admin" : "player";
}

async function loadSession() {
    seedDemoData();
    state.pendingQrToken = getPendingQrToken();

    if (supabaseClient) {
        const { data } = await supabaseClient.auth.getSession();
        if (data.session?.user) {
            state.user = await getSupabaseProfile(data.session.user);
            state.view = resolveViewForUser(state.user);
        }
    } else {
        state.user = storage.read("ct_session", null);
        if (!state.user && APP_MODE === "admin") {
            state.user = { ...demoUsers[0] };
            storage.write("ct_session", state.user);
        }
        if (state.user) state.view = resolveViewForUser(state.user);
    }

    await refreshData();
    render();
    setupRealtimeSync();
    await consumePendingQrToken();
}

async function getSupabaseProfile(authUser) {
    const { data } = await supabaseClient
        .from("profiles")
        .select("id,name,email,role")
        .eq("id", authUser.id)
        .single();

    return data || {
        id: authUser.id,
        name: authUser.user_metadata?.name || authUser.email,
        email: authUser.email,
        role: authUser.user_metadata?.role || "player"
    };
}

async function refreshData() {
    if (supabaseClient && state.user) {
        const [{ data: locations }, { data: cards }, { data: profiles }, { data: scans }, { data: inventory }, { data: trades }, { data: housePurchases }, { data: cardCodes }, { data: settings }] = await Promise.all([
            supabaseClient.from("treasure_locations").select("*").order("created_at", { ascending: false }),
            supabaseClient.from("cards").select("*").order("name"),
            supabaseClient.from("profiles").select("id,name,email,role,points_balance").order("name"),
            supabaseClient.from("scans").select("*").order("created_at", { ascending: false }),
            supabaseClient.from("inventory").select("*, cards(*)").eq("user_id", state.user.id),
            supabaseClient.from("trade_offers").select("*").or(`from_user_id.eq.${state.user.id},to_user_id.eq.${state.user.id}`).order("created_at", { ascending: false }),
            supabaseClient.from("house_purchases").select("*").order("created_at", { ascending: false }),
            supabaseClient.from("card_codes").select("*").order("created_at", { ascending: false }),
            supabaseClient.from("app_settings").select("*").eq("id", 1).single()
        ]);

        state.locations = locations || [];
        state.cards = normalizeCards(cards || []);
        state.users = profiles || [];
        state.scans = scans || [];
        state.trades = trades || [];
        state.housePurchases = housePurchases || [];
        state.cardCodes = cardCodes || [];
        state.settings = settings || demoSettings;
        state.user = {
            ...state.user,
            points_balance: state.users.find((user) => user.id === state.user.id)?.points_balance || 0
        };
        state.inventory = (inventory || []).map((item) => ({
            ...normalizeCard(item.cards),
            inventory_id: item.id,
            card_code_id: item.card_code_id,
            acquired_at: item.acquired_at
        }));
        return;
    }

    state.locations = storage.read("ct_locations", demoLocations);
    state.cards = normalizeCards(storage.read("ct_cards", demoCards));
    state.users = storage.read("ct_users", demoUsers).map((user) => ({ points_balance: 0, ...user }));
    state.scans = storage.read("ct_scans", []);
    state.trades = storage.read("ct_trades", []);
    state.housePurchases = storage.read("ct_house_purchases", []);
    state.cardCodes = storage.read("ct_card_codes", demoCardCodes);
    state.settings = storage.read("ct_settings", demoSettings);
    if (state.user) {
        const currentUser = state.users.find((user) => user.id === state.user.id);
        if (currentUser) {
            state.user = { ...currentUser };
            storage.write("ct_session", state.user);
        }
    }
    const inventory = storage.read("ct_inventory", []);
    state.inventory = inventory
        .filter((item) => item.user_id === state.user?.id)
        .map((item) => ({
            ...state.cards.find((card) => card.id === item.card_id),
            inventory_id: item.id,
            card_code_id: item.card_code_id,
            acquired_at: item.acquired_at
        }))
        .filter(Boolean);
}

function setupRealtimeSync() {
    if (!supabaseClient || !state.user || state.realtimeChannel) return;

    state.realtimeChannel = supabaseClient
        .channel(`cartinhas-sync-${state.user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "inventory" }, scheduleRealtimeRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, scheduleRealtimeRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "house_purchases" }, scheduleRealtimeRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "trade_offers" }, scheduleRealtimeRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "card_codes" }, scheduleRealtimeRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "cards" }, scheduleRealtimeRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "treasure_locations" }, scheduleRealtimeRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, scheduleRealtimeRefresh)
        .subscribe();
}

async function clearRealtimeSync() {
    if (state.realtimeRefreshTimer) {
        window.clearTimeout(state.realtimeRefreshTimer);
        state.realtimeRefreshTimer = null;
    }

    if (supabaseClient && state.realtimeChannel) {
        await supabaseClient.removeChannel(state.realtimeChannel);
    }

    state.realtimeChannel = null;
    state.realtimeRefreshing = false;
}

function scheduleRealtimeRefresh() {
    if (!state.user) return;
    if (state.realtimeRefreshTimer) window.clearTimeout(state.realtimeRefreshTimer);
    state.realtimeRefreshTimer = window.setTimeout(refreshFromRealtime, 450);
}

async function refreshFromRealtime() {
    if (!state.user || state.realtimeRefreshing) return;

    state.realtimeRefreshTimer = null;
    state.realtimeRefreshing = true;

    try {
        await refreshData();
        if (!state.scannerRunning && !state.tradeScannerRunning) {
            render({ keepScanner: true });
        }
    } catch (error) {
        console.warn(error);
    } finally {
        state.realtimeRefreshing = false;
    }
}

function render(options = {}) {
    if (!options.keepScanner) stopScanner();

    if (!state.user || state.view === "auth") {
        app.innerHTML = authTemplate();
        bindAuthEvents();
    } else {
        app.innerHTML = shellTemplate();
        bindShellEvents();
    }

    if (window.lucide) window.lucide.createIcons();
}

function authTemplate() {
    const isRegister = state.authMode === "register";
    const isAdminApp = APP_MODE === "admin";
    const loginValue = isRegister ? "" : (isAdminApp ? "admin@demo.local" : "jogador@demo.local");
    return `
        <section class="auth-screen">
            <div class="auth-art">
                <div class="map-board" aria-hidden="true">
                    <span class="map-path"></span>
                    <span class="map-pin one"></span>
                    <span class="map-pin two"></span>
                    <span class="map-pin three"></span>
                </div>
                <div class="auth-copy">
                    <h1>${isAdminApp ? "Painel Administrativo" : "App do Jogador"}</h1>
                    <p>${isAdminApp ? "Configure condições, pontos, cartas, locais e usuários da campanha." : "Veja suas cartas, acompanhe pistas, leia QR Codes e troque com outros jogadores."}</p>
                </div>
            </div>
            <div class="auth-pane">
                <form class="auth-card" id="auth-form">
                    <h2>${isRegister ? "Criar conta" : "Entrar"}</h2>
                    <p class="small">${isSupabaseConfigured ? "Conectado ao Supabase configurado no app.js." : "Modo demo ativo. Configure as credenciais do Supabase no app.js para usar dados reais."}</p>
                    <div class="segmented" role="tablist">
                        <button class="segment ${!isRegister ? "active" : ""}" type="button" data-auth-mode="login">Login</button>
                        <button class="segment ${isRegister ? "active" : ""}" type="button" data-auth-mode="register">Cadastro</button>
                    </div>
                    <div class="form-grid">
                        ${isRegister ? `
                            <div class="field">
                                <label for="name">Nome</label>
                                <input id="name" name="name" autocomplete="name" required>
                            </div>
                        ` : ""}
                        <div class="field">
                            <label for="email">E-mail</label>
                            <input id="email" name="email" type="email" autocomplete="email" required value="${loginValue}">
                        </div>
                        <div class="field">
                            <label for="password">Senha</label>
                            <input id="password" name="password" type="password" autocomplete="${isRegister ? "new-password" : "current-password"}" required value="${isRegister ? "" : "admin123"}">
                        </div>
                        ${isRegister && !isSupabaseConfigured && APP_MODE !== "player" ? `
                            <div class="field">
                                <label for="role">Perfil</label>
                                <select id="role" name="role">
                                    <option value="player">Jogador</option>
                                    <option value="admin">Administrador</option>
                                </select>
                            </div>
                        ` : ""}
                        <button class="primary-button" type="submit">
                            <i data-lucide="${isRegister ? "user-plus" : "log-in"}"></i>
                            ${isRegister ? "Cadastrar" : "Entrar"}
                        </button>
                    </div>
                </form>
            </div>
        </section>
    `;
}

function shellTemplate() {
    const isAdmin = state.user.role === "admin";
    const canUseAdminPanel = APP_MODE === "admin" || isAdmin;
    const fixedMode = APP_MODE === "admin" || APP_MODE === "player";
    const currentTitle = state.view === "admin" ? "Painel administrativo" : "App do jogador";
    const currentSubtitle = state.view === "admin"
        ? "Configurações, condições, cartas, locais, usuários e pontos."
        : "Cartas, pistas, leitura de QR, código manual e trocas.";
    return `
        <div class="app-shell app-mode-${APP_MODE}">
            <aside class="side-rail">
                <div class="brand">
                    <div class="brand-mark"><i data-lucide="map"></i></div>
                    <div>
                        <h1>Cartinhas Digitais</h1>
                        <p>${isSupabaseConfigured ? "Supabase ativo" : "Modo demo local"}</p>
                    </div>
                </div>
                <nav class="nav-tabs ${fixedMode ? "hidden" : ""}">
                    <button class="nav-button ${state.view === "player" ? "active" : ""}" data-view="player">
                        <i data-lucide="scan-line"></i> Area do jogador
                    </button>
                    <button class="nav-button ${state.view === "admin" ? "active" : ""}" data-view="admin" ${canUseAdminPanel ? "" : "disabled"}>
                        <i data-lucide="sliders-horizontal"></i> Painel admin
                    </button>
                </nav>
                <div class="session-card">
                    <strong>${state.user.name || state.user.email}</strong>
                    <p>${state.user.email}</p>
                    <p class="badge ${canUseAdminPanel ? "" : "warn"}">${canUseAdminPanel ? "Administrador" : "Jogador"}</p>
                </div>
            </aside>
            <main class="main-panel">
                <header class="topbar">
                    <div class="page-title">
                        <h2>${currentTitle}</h2>
                        <p>${currentSubtitle}</p>
                    </div>
                    <button class="ghost-button" id="logout-button" type="button">
                        <i data-lucide="log-out"></i> Sair
                    </button>
                </header>
                ${state.view === "admin" ? (canUseAdminPanel ? adminTemplate() : adminAccessDeniedTemplate()) : playerAppTemplate()}
            </main>
        </div>
    `;
}

function adminAccessDeniedTemplate() {
    const adminEmail = escapeHtml(state.user?.email || "seu-email@exemplo.com");
    return `
        <section class="panel">
            <div class="panel-header">
                <div>
                    <h3>Acesso administrativo bloqueado</h3>
                    <p class="small">Este ambiente é reservado para administradores. Entre com uma conta admin ou promova seu usuário no Supabase.</p>
                </div>
            </div>
            <div class="setup-note">
                <strong>Para liberar as acoes do painel:</strong>
                <code>update public.profiles set role = 'admin' where email = '${adminEmail}';</code>
                <span>Tambem deixei isso pronto no arquivo supabase-promover-admin.sql.</span>
            </div>
            <a class="ghost-button link-button" href="index.html">
                <i data-lucide="home"></i> Voltar ao portal administrativo
            </a>
        </section>
    `;
}

function adminTemplate() {
    const activeLocations = state.locations.filter((location) => location.active).length;
    return `
        <section class="stats" aria-label="Resumo da campanha">
            <div class="stat"><span>Locais</span><strong>${state.locations.length}</strong></div>
            <div class="stat"><span>Ativos</span><strong>${activeLocations}</strong></div>
            <div class="stat"><span>Cartas</span><strong>${state.cards.length}</strong></div>
            <div class="stat"><span>Leituras</span><strong>${state.scans.length}</strong></div>
        </section>
        <section class="admin-hub" aria-label="Atalhos do painel">
            <a class="admin-shortcut" href="#admin-config">
                <i data-lucide="settings"></i>
                <strong>Configuracoes</strong>
                <span>Condicoes, pontos e resgate.</span>
            </a>
            <a class="admin-shortcut" href="#admin-cartas">
                <i data-lucide="badge-plus"></i>
                <strong>Cartinhas</strong>
                <span>Modelos, imagens e valores.</span>
            </a>
            <a class="admin-shortcut" href="#admin-ids">
                <i data-lucide="fingerprint"></i>
                <strong>IDs unicos</strong>
                <span>Codigos restritos por carta fisica.</span>
            </a>
            <a class="admin-shortcut" href="#admin-pagamentos">
                <i data-lucide="credit-card"></i>
                <strong>Pagamentos</strong>
                <span>Aprovar vendas para a casa.</span>
            </a>
            <a class="admin-shortcut" href="#admin-usuarios">
                <i data-lucide="users"></i>
                <strong>Usuarios</strong>
                <span>Saldos e perfis dos jogadores.</span>
            </a>
        </section>
        <section class="panel" id="admin-config" style="margin-bottom:16px">
            <div class="panel-header">
                <div>
                    <h3>Configuracoes de pontos</h3>
                    <p class="small">Define a conversao futura de pontos em dinheiro para exibicao aos jogadores.</p>
                </div>
            </div>
            <form class="settings-form" id="settings-form">
                <div class="field">
                    <label for="point-cash-rate">Valor por ponto em R$</label>
                    <input id="point-cash-rate" name="point_cash_rate" type="number" min="0" step="0.01" value="${state.settings.point_cash_rate}">
                </div>
                <div class="field">
                    <label for="minimum-redeem-points">Minimo para resgate</label>
                    <input id="minimum-redeem-points" name="minimum_redeem_points" type="number" min="0" step="1" value="${state.settings.minimum_redeem_points}">
                </div>
                <div class="field settings-wide">
                    <label for="campaign-conditions">Condições da campanha</label>
                    <textarea id="campaign-conditions" name="campaign_conditions">${escapeHtml(state.settings.campaign_conditions || "")}</textarea>
                </div>
                <button class="primary-button" type="submit">
                    <i data-lucide="save"></i> Salvar
                </button>
            </form>
        </section>
        <section class="grid two" id="admin-cartas">
            <form class="panel" id="location-form">
                <div class="panel-header">
                    <div>
                        <h3>Novo local</h3>
                        <p class="small">Cada local gera um token que deve estar no QR Code fisico.</p>
                    </div>
                </div>
                <div class="form-grid">
                    <div class="field">
                        <label for="location-name">Nome do local</label>
                        <input id="location-name" name="name" required>
                    </div>
                    <div class="field">
                        <label for="location-clue">Pista</label>
                        <textarea id="location-clue" name="clue" required></textarea>
                    </div>
                    <div class="field">
                        <label for="location-token">Token do QR Code</label>
                        <input id="location-token" name="qr_token" required value="${createToken()}">
                    </div>
                    <div class="field">
                        <label for="location-card">Carta liberada</label>
                        <select id="location-card" name="card_id" required>
                            ${state.cards.map((card) => `<option value="${card.id}">${card.name} - ${card.rarity}</option>`).join("")}
                        </select>
                    </div>
                    <button class="primary-button" type="submit">
                        <i data-lucide="plus"></i> Adicionar local
                    </button>
                </div>
            </form>
            <form class="panel" id="card-form">
                <div class="panel-header">
                    <div>
                        <h3>Nova carta</h3>
                        <p class="small">Crie recompensas digitais para vincular aos locais.</p>
                    </div>
                </div>
                <div class="form-grid">
                    <div class="field">
                        <label for="card-name">Nome da carta</label>
                        <input id="card-name" name="name" required>
                    </div>
                    <div class="field">
                        <label for="card-number">Numero</label>
                        <input id="card-number" name="number" placeholder="Ex.: 004" required>
                    </div>
                    <div class="field">
                        <label for="card-rarity">Raridade</label>
                        <select id="card-rarity" name="rarity">
                            <option>Comum</option>
                            <option>Rara</option>
                            <option>Epica</option>
                            <option>Lendaria</option>
                        </select>
                    </div>
                    <div class="field">
                        <label for="card-color">Cor</label>
                        <input id="card-color" name="color" type="color" value="#d99b2b">
                    </div>
                    <div class="field">
                        <label for="card-points">Valor em pontos</label>
                        <input id="card-points" name="point_value" type="number" min="0" step="1" value="100" required>
                    </div>
                    <div class="field">
                        <label for="card-money">Valor base em R$</label>
                        <input id="card-money" name="money_value" type="number" min="0" step="0.01" value="0">
                    </div>
                    <label class="check-field">
                        <input id="card-is-fake" name="is_fake" type="checkbox">
                        <span>Carta falsa sem valor</span>
                    </label>
                    <div class="field">
                        <label for="card-image">Imagem da carta</label>
                        <input id="card-image" name="image_path" placeholder="Link do Dropbox ou cartinhas/004.jpg" list="card-image-suggestions">
                        <datalist id="card-image-suggestions">
                            <option value="cartinhas/001.jpg"></option>
                            <option value="cartinhas/001.jpeg"></option>
                            <option value="cartinhas/001.png"></option>
                            <option value="https://www.dropbox.com/scl/fi/arquivo/cartinha.png?dl=0"></option>
                        </datalist>
                    </div>
                    <div class="field">
                        <label for="card-image-file">Pegar arquivo JPEG/PNG</label>
                        <input id="card-image-file" type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png">
                        <span class="small">Use um link compartilhado do Dropbox ou coloque o arquivo dentro da pasta cartinhas.</span>
                    </div>
                    <div class="field">
                        <label for="card-token">Token do modelo</label>
                        <input id="card-token" name="qr_token" value="${createCardToken()}" required>
                        <span class="small">Uso interno do modelo da carta. Nao e o QR fisico.</span>
                    </div>
                    <div class="field">
                        <label for="card-initial-code">ID/QR da cartinha fisica</label>
                        <input id="card-initial-code" name="initial_code" value="${createUniqueCardCode()}" required>
                        <span class="small">Este e o codigo que vai no QR fisico e libera a carta no app.</span>
                    </div>
                    <div class="field">
                        <label for="card-description">Descricao</label>
                        <textarea id="card-description" name="description" required></textarea>
                    </div>
                    <button class="primary-button" type="submit">
                        <i data-lucide="badge-plus"></i> Criar carta + ID/QR
                    </button>
                </div>
            </form>
        </section>
        <section class="panel admin-card-map-panel" style="margin-top:16px">
            <div class="panel-header">
                <div>
                    <h3>Mapa das cartinhas salvas</h3>
                    <p class="small">Veja a imagem, o numero da carta, o token do modelo e os IDs fisicos que liberam ela no app do jogador.</p>
                </div>
                <span class="badge">${state.cards.length} carta${state.cards.length === 1 ? "" : "s"}</span>
            </div>
            <div class="admin-card-map">
                ${adminCardOverviewTemplate()}
            </div>
        </section>
        ${editCardPanelTemplate(state.cards.find((card) => card.id === state.editingCardId))}
        <section class="grid two" style="margin-top:16px">
            <div class="panel">
                <div class="panel-header">
                    <div>
                        <h3>Locais cadastrados</h3>
                        <p class="small">Use o token como conteudo do QR Code impresso.</p>
                    </div>
                </div>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr><th>Local</th><th>Token</th><th>Carta</th><th>Status</th><th></th></tr>
                        </thead>
                        <tbody>
                            ${state.locations.map(locationRow).join("")}
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="panel">
                <div class="panel-header">
                    <div>
                        <h3>Cartas cadastradas</h3>
                        <p class="small">A carta define o modelo. A validação no app usa os IDs únicos cadastrados abaixo.</p>
                    </div>
                </div>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr><th>#</th><th>Carta</th><th>Pontos</th><th>Token do modelo</th></tr>
                        </thead>
                        <tbody>
                            ${adminCardRows()}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>
        <section class="grid two" id="admin-ids" style="margin-top:16px">
            <form class="panel" id="card-code-form">
                <div class="panel-header">
                    <div>
                        <h3>Adicionar outro ID/QR</h3>
                        <p class="small">Use quando quiser imprimir outra cartinha fisica do mesmo modelo. Cada ID libera a carta uma unica vez.</p>
                    </div>
                </div>
                <div class="form-grid">
                    <div class="field">
                        <label for="code-card">Carta que esse QR vai liberar</label>
                        <select id="code-card" name="card_id" required>
                            ${state.cards.map((card) => `<option value="${card.id}">#${escapeHtml(card.number)} ${escapeHtml(card.name)}</option>`).join("")}
                        </select>
                    </div>
                    <div class="field">
                        <label for="code-token">ID/QR fisico unico</label>
                        <input id="code-token" name="code" value="${createUniqueCardCode()}" required>
                        <span class="small">Este codigo vira o QR Code da cartinha fisica.</span>
                    </div>
                    <button class="primary-button" type="submit">
                        <i data-lucide="qr-code"></i> Cadastrar ID/QR
                    </button>
                </div>
            </form>
            <div class="panel">
                <div class="panel-header">
                    <div>
                        <h3>IDs cadastrados</h3>
                        <p class="small">Use estes códigos nos QR Codes ou impressos nas cartinhas.</p>
                    </div>
                </div>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr><th>ID</th><th>Cartinha</th><th>Status</th><th>Vinculado</th></tr>
                        </thead>
                        <tbody>
                            ${cardCodeRows()}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>
        <section class="panel payments-panel" id="admin-pagamentos" style="margin-top:16px">
            <div class="panel-header">
                <div>
                    <h3>Resgates e pagamentos</h3>
                    <p class="small">Aqui aparecem os resgates enviados pelo app. Clique em pagar/aprovar para aceitar o resgate do jogador.</p>
                </div>
                <span class="badge warn">${state.housePurchases.filter((purchase) => purchase.status === "pending").length} pendente(s)</span>
            </div>
            <div class="payment-card-list">
                ${paymentRequestCards()}
            </div>
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr><th>Jogador</th><th>Carta</th><th>Valor pedido</th><th>Status</th><th>Ações</th></tr>
                    </thead>
                    <tbody>
                        ${housePurchaseRows()}
                    </tbody>
                </table>
            </div>
        </section>
        <section class="panel" id="admin-usuarios" style="margin-top:16px">
            <div class="panel-header">
                <div>
                    <h3>Usuarios</h3>
                    <p class="small">Saldo de pontos e perfil dos jogadores.</p>
                </div>
            </div>
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Saldo</th></tr>
                    </thead>
                    <tbody>
                        ${state.users.map((user) => `
                            <tr>
                                <td>${escapeHtml(user.name || "-")}</td>
                                <td>${escapeHtml(user.email || "-")}</td>
                                <td><span class="badge ${user.role === "admin" ? "" : "warn"}">${user.role}</span></td>
                                <td>${formatPoints(user.points_balance || 0)}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        </section>
    `;
}

function paymentRequestCards() {
    const visiblePurchases = state.housePurchases.filter((purchase) => purchase.status === "pending");

    if (!visiblePurchases.length) {
        return `
            <article class="payment-request-card empty">
                <i data-lucide="wallet"></i>
                <div>
                    <h4>Nenhum resgate pendente</h4>
                    <p>Quando um jogador solicitar resgate pelo app, ele aparece aqui para pagamento/aprovacao.</p>
                </div>
            </article>
        `;
    }

    return visiblePurchases.map((purchase) => {
        const user = state.users.find((item) => item.id === purchase.user_id);
        const card = state.cards.find((item) => item.id === purchase.card_id);

        return `
            <article class="payment-request-card">
                <div class="payment-card-thumb">
                    ${card?.image_path ? `<img src="${escapeAttribute(card.image_path)}" alt="${escapeAttribute(card.name)}" onerror="this.classList.add('hidden')">` : `<i data-lucide="wallet"></i>`}
                </div>
                <div>
                    <span class="small">Jogador</span>
                    <h4>${escapeHtml(user?.name || user?.email || "Jogador")}</h4>
                    <p>#${escapeHtml(card?.number || "-")} ${escapeHtml(card?.name || "Carta")} - ${formatCurrency(purchase.asking_price)}</p>
                    <span class="small">Solicitado em ${formatDateTime(purchase.created_at)}</span>
                </div>
                <div class="payment-actions">
                    <button class="primary-button" type="button" data-approve-house-purchase="${purchase.id}">
                        <i data-lucide="check"></i> Pagar / aprovar
                    </button>
                    <button class="ghost-button" type="button" data-reject-house-purchase="${purchase.id}">
                        <i data-lucide="x"></i> Recusar
                    </button>
                </div>
            </article>
        `;
    }).join("");
}

function adminCardOverviewTemplate() {
    if (!state.cards.length) {
        return `
            <article class="admin-empty-card">
                <i data-lucide="badge-plus"></i>
                <h4>Nenhuma carta cadastrada</h4>
                <p>Crie a primeira carta no formulario acima. Depois cadastre pelo menos um ID unico para ela aparecer no app do jogador.</p>
            </article>
        `;
    }

    return state.cards.map((card) => {
        const codes = state.cardCodes.filter((code) => code.card_id === card.id);
        const claimedCodes = codes.filter((code) => code.claimed_by);
        const freeCodes = codes.filter((code) => !code.claimed_by && code.active);
        const inactiveCodes = codes.filter((code) => !code.active);

        return `
            <article class="admin-card-overview" style="--card-color:${card.color || "#d99b2b"}">
                <div class="admin-card-preview">
                    ${card.image_path ? `<img src="${escapeAttribute(card.image_path)}" alt="${escapeAttribute(card.name)}" onerror="this.classList.add('hidden')">` : `<i data-lucide="image-off"></i>`}
                </div>
                <div class="admin-card-body">
                    <div class="admin-card-title">
                        <div>
                            <span class="card-number">#${escapeHtml(card.number)}</span>
                            <h4>${escapeHtml(card.name)}</h4>
                        </div>
                        <span class="badge">${escapeHtml(card.rarity)}</span>
                    </div>
                    ${card.is_fake ? `<span class="badge warn">Carta falsa sem valor</span>` : ""}
                    <p>${escapeHtml(card.description || "Sem descricao.")}</p>
                    <div class="admin-card-metrics">
                        <span><strong>${formatPoints(card.point_value)}</strong><small>Pontos</small></span>
                        <span><strong>${formatCurrency(card.money_value || 0)}</strong><small>Valor</small></span>
                        <span><strong>${codes.length}</strong><small>IDs</small></span>
                    </div>
                    <div class="admin-code-status">
                        <span class="badge">${freeCodes.length} livres</span>
                        <span class="badge warn">${claimedCodes.length} usados</span>
                        ${inactiveCodes.length ? `<span class="badge">${inactiveCodes.length} pausados</span>` : ""}
                    </div>
                    <div class="admin-card-codes">
                        <span class="small">Token do modelo</span>
                        ${copyableCodeButton(card.qr_token || "-")}
                        <span class="small">IDs fisicos para QR/app</span>
                        ${adminCardIdList(codes)}
                    </div>
                    <button class="ghost-button" type="button" data-edit-card="${escapeAttribute(card.id)}">
                        <i data-lucide="pencil"></i> Editar carta
                    </button>
                    <span class="small image-path-line">${escapeHtml(card.image_path || "sem imagem")}</span>
                </div>
            </article>
        `;
    }).join("");
}

function editCardPanelTemplate(card) {
    if (!card) return "";

    return `
        <section class="panel edit-card-panel" id="edit-card-panel" style="margin-top:16px">
            <div class="panel-header">
                <div>
                    <h3>Editar carta #${escapeHtml(card.number)}</h3>
                    <p class="small">Atualize nome, valores, imagem e descricao da cartinha que aparece no app.</p>
                </div>
                <button class="icon-button" type="button" data-cancel-edit-card title="Fechar edicao">
                    <i data-lucide="x"></i>
                </button>
            </div>
            <form class="form-grid edit-card-form" id="edit-card-form">
                <input type="hidden" name="id" value="${escapeAttribute(card.id)}">
                <div class="field">
                    <label for="edit-card-name">Nome da carta</label>
                    <input id="edit-card-name" name="name" value="${escapeAttribute(card.name)}" required>
                </div>
                <div class="field">
                    <label for="edit-card-rarity">Raridade</label>
                    <select id="edit-card-rarity" name="rarity">
                        ${["Comum", "Rara", "Epica", "Lendaria"].map((rarity) => `<option ${card.rarity === rarity ? "selected" : ""}>${rarity}</option>`).join("")}
                    </select>
                </div>
                <div class="field">
                    <label for="edit-card-points">Valor em pontos</label>
                    <input id="edit-card-points" name="point_value" type="number" min="0" step="1" value="${Number(card.point_value || 0)}" required>
                </div>
                <div class="field">
                    <label for="edit-card-money">Valor base em R$</label>
                    <input id="edit-card-money" name="money_value" type="number" min="0" step="0.01" value="${Number(card.money_value || 0)}">
                </div>
                <label class="check-field">
                    <input id="edit-card-is-fake" name="is_fake" type="checkbox" ${card.is_fake ? "checked" : ""}>
                    <span>Carta falsa sem valor</span>
                </label>
                <div class="field">
                    <label for="edit-card-image">Imagem da carta</label>
                    <input id="edit-card-image" name="image_path" value="${escapeAttribute(card.image_path || "")}" placeholder="Link do Dropbox ou cartinhas/004.jpg">
                </div>
                <div class="field">
                    <label for="edit-card-color">Cor</label>
                    <input id="edit-card-color" name="color" type="color" value="${escapeAttribute(card.color || "#d99b2b")}">
                </div>
                <div class="field settings-wide">
                    <label for="edit-card-description">Descricao</label>
                    <textarea id="edit-card-description" name="description">${escapeHtml(card.description || "")}</textarea>
                </div>
                <button class="primary-button" type="submit">
                    <i data-lucide="save"></i> Salvar alteracoes
                </button>
            </form>
        </section>
    `;
}

function adminCardIdList(codes) {
    if (!codes.length) {
        return `<span class="missing-code">Sem ID unico cadastrado</span>`;
    }

    return `
        <div class="admin-id-qr-list">
            ${codes.map((code) => `
                <div class="admin-id-qr-item ${code.claimed_by ? "claimed" : ""} ${code.active ? "" : "inactive"}">
                    ${qrCodeImage(code.code, `QR do ID ${code.code}`)}
                    <span class="badge ${code.claimed_by || !code.active ? "warn" : ""}">${cardCodeStatusLabel(code)}</span>
                    ${copyableCodeButton(code.code, code.claimed_by ? "claimed" : "")}
                    ${!code.claimed_by ? `
                        <button class="ghost-button tiny-button" type="button" data-toggle-card-code="${escapeAttribute(code.id)}">
                            <i data-lucide="${code.active ? "lock" : "unlock"}"></i> ${code.active ? "Bloquear" : "Liberar"}
                        </button>
                    ` : ""}
                </div>
            `).join("")}
        </div>
    `;
}

function cardCodeStatusLabel(code) {
    if (code.claimed_by && !code.active) return "Pago/Bloqueado";
    if (code.claimed_by) return "Usado";
    if (!code.active) return "Bloqueado";
    return "Livre";
}

function qrCodeImage(value, label = "QR Code") {
    const text = String(value || "").trim();
    if (!text) return "";

    return `
        <img class="qr-code-image"
            src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=10&data=${encodeURIComponent(text)}"
            alt="${escapeAttribute(label)}"
            loading="lazy">
    `;
}

function copyableCodeButton(value, extraClass = "") {
    return `
        <button class="code-copy-button ${extraClass}" type="button" data-copy-code="${escapeAttribute(value)}" title="Copiar codigo">
            <code>${escapeHtml(value)}</code>
            <i data-lucide="copy"></i>
        </button>
    `;
}

function adminCardRows() {
    if (!state.cards.length) {
        return `
            <tr>
                <td colspan="4">Nenhuma carta cadastrada.</td>
            </tr>
        `;
    }

    return state.cards.map((card) => {
        const codes = state.cardCodes.filter((code) => code.card_id === card.id);
        const freeCount = codes.filter((code) => !code.claimed_by && code.active).length;
        const blockedCount = codes.filter((code) => !code.claimed_by && !code.active).length;
        const claimedCount = codes.filter((code) => code.claimed_by).length;

        return `
            <tr>
                <td><strong>${escapeHtml(card.number)}</strong></td>
                <td>
                    <div class="table-card-cell">
                        <span class="table-card-thumb">
                            ${card.image_path ? `<img src="${escapeAttribute(card.image_path)}" alt="${escapeAttribute(card.name)}" onerror="this.classList.add('hidden')">` : `<i data-lucide="image-off"></i>`}
                        </span>
                        <span>
                            <strong>${escapeHtml(card.name)}</strong>
                            ${card.is_fake ? `<span class="badge warn">Falsa</span>` : ""}
                            <span class="small">${escapeHtml(card.image_path || "sem imagem")}</span>
                        </span>
                    </div>
                </td>
                <td>${formatPoints(card.point_value)}<br><span class="small">${formatCurrency(card.money_value || 0)}</span></td>
                <td>
                    <code>${escapeHtml(card.qr_token)}</code>
                    <br><span class="small">${freeCount} livre(s), ${blockedCount} bloqueado(s), ${claimedCount} usado(s)</span>
                </td>
            </tr>
        `;
    }).join("");
}

function locationRow(location) {
    const card = state.cards.find((item) => item.id === location.card_id);
    return `
        <tr>
            <td><strong>${escapeHtml(location.name)}</strong><br><span class="small">${escapeHtml(location.clue)}</span></td>
            <td><code>${escapeHtml(location.qr_token)}</code></td>
            <td>${escapeHtml(card?.name || "Carta removida")}</td>
            <td><span class="badge ${location.active ? "" : "warn"}">${location.active ? "Ativo" : "Pausado"}</span></td>
            <td>
                <button class="icon-button" type="button" title="Alternar status" data-toggle-location="${location.id}">
                    <i data-lucide="${location.active ? "pause" : "play"}"></i>
                </button>
            </td>
        </tr>
    `;
}

function housePurchaseRows() {
    const visiblePurchases = state.housePurchases.filter((purchase) => purchase.status === "pending");

    if (!visiblePurchases.length) {
        return `
            <tr>
                <td colspan="5">Nenhuma venda pendente.</td>
            </tr>
        `;
    }

    return visiblePurchases.map((purchase) => {
        const user = state.users.find((item) => item.id === purchase.user_id);
        const card = state.cards.find((item) => item.id === purchase.card_id);
        return `
            <tr>
                <td>${escapeHtml(user?.name || user?.email || "Jogador")}</td>
                <td>#${escapeHtml(card?.number || "-")} ${escapeHtml(card?.name || "Carta")}</td>
                <td>${formatCurrency(purchase.asking_price)}</td>
                <td><span class="badge warn">${escapeHtml(purchase.status)}</span></td>
                <td>
                    <div class="action-row">
                        <button class="primary-button" type="button" data-approve-house-purchase="${purchase.id}">
                            <i data-lucide="check"></i> Pagar / aprovar
                        </button>
                        <button class="ghost-button" type="button" data-reject-house-purchase="${purchase.id}">
                            <i data-lucide="x"></i> Recusar
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

function cardCodeRows() {
    if (!state.cardCodes.length) {
        return `
            <tr>
                <td colspan="4">Nenhum ID unico cadastrado.</td>
            </tr>
        `;
    }

    return state.cardCodes.map((code) => {
        const card = state.cards.find((item) => item.id === code.card_id);
        const user = state.users.find((item) => item.id === code.claimed_by);
        const claimed = Boolean(code.claimed_by);
        return `
            <tr>
                <td>
                    <div class="table-qr-cell">
                        ${qrCodeImage(code.code, `QR do ID ${code.code}`)}
                        ${copyableCodeButton(code.code, claimed ? "claimed" : "")}
                    </div>
                </td>
                <td>#${escapeHtml(card?.number || "-")} ${escapeHtml(card?.name || "Carta")}</td>
                <td><span class="badge ${claimed || !code.active ? "warn" : ""}">${cardCodeStatusLabel(code)}</span></td>
                <td>${claimed ? `${escapeHtml(user?.name || user?.email || "Jogador")}<br><span class="small">${escapeHtml(code.claimed_device_id || "-")}</span>` : "-"}</td>
            </tr>
        `;
    }).join("");
}

function playerAppTemplate() {
    const redeemValue = Number(state.user.points_balance || 0) * Number(state.settings.point_cash_rate || 0);
    const activeCard = state.inventory[0];
    return `
        <section class="player-wallet">
            <div class="player-wallet-bar">
                <div>
                    <span class="small">Minha colecao</span>
                    <strong>${state.inventory.length} cartinha${state.inventory.length === 1 ? "" : "s"}</strong>
                </div>
                <div>
                    <span class="small">Saldo</span>
                    <strong>${formatPoints(state.user.points_balance || 0)}</strong>
                </div>
                <div>
                    <span class="small">Valor</span>
                    <strong>${formatCurrency(redeemValue)}</strong>
                </div>
            </div>
            <div class="player-card-carousel" aria-label="Minhas cartinhas">
                ${state.inventory.length ? state.inventory.map(playerDeckCard).join("") : emptyPlayerDeckTemplate()}
            </div>
            <div class="player-card-dots" aria-hidden="true">
                ${state.inventory.map((_, index) => `<span class="${index === 0 ? "active" : ""}"></span>`).join("")}
            </div>
            <div class="player-id-chip">
                <span>Meu ID</span>
                <strong>${escapeHtml(state.user.id)}</strong>
            </div>
        </section>
        <section class="player-bottom-actions" aria-label="Acoes da cartinha">
            <button class="player-action-button" id="open-trade-button" type="button" ${state.inventory.length ? "" : "disabled"}>
                <i data-lucide="repeat-2"></i>
                <span>Trocar</span>
            </button>
            <button class="player-action-button" id="open-redeem-button" type="button" ${state.inventory.length ? "" : "disabled"}>
                <i data-lucide="wallet"></i>
                <span>Resgatar</span>
            </button>
            <button class="player-action-button primary" id="open-capture-button" type="button">
                <i data-lucide="scan-line"></i>
                <span>Scanear QR</span>
            </button>
        </section>
        <div class="player-sheet-backdrop hidden" id="player-sheet-backdrop"></div>
        ${playerActionSheetsTemplate(activeCard)}
    `;
}

function playerDeckCard(card) {
    return `
        <article class="player-deck-card" style="--card-color:${card.color || "#d99b2b"}">
            <div class="player-deck-art">
                ${card.image_path ? `<img src="${escapeAttribute(card.image_path)}" alt="${escapeAttribute(card.name)}" onerror="this.classList.add('hidden')">` : `<i data-lucide="sparkles"></i>`}
                <div class="player-card-overlay">
                    <span>#${escapeHtml(card.number)}</span>
                    <strong>${escapeHtml(card.rarity)}</strong>
                </div>
            </div>
            <div class="player-deck-info">
                <span class="card-number">#${escapeHtml(card.number)}</span>
                <h4>${escapeHtml(card.name)}</h4>
                <p>${escapeHtml(card.description || "Carta colecionavel desbloqueada.")}</p>
                <div class="action-row">
                    <span class="badge warn">${formatPoints(card.point_value)}</span>
                    <span class="badge">${formatCurrency(card.money_value || 0)}</span>
                </div>
            </div>
        </article>
    `;
}

function emptyPlayerDeckTemplate() {
    return `
        <article class="player-empty-deck">
            <i data-lucide="scan-line"></i>
            <h3>Nenhuma cartinha ainda</h3>
            <p>Use o botao de scanear QR para validar uma cartinha fisica e desbloquear sua colecao.</p>
        </article>
    `;
}

function playerActionSheetsTemplate(activeCard) {
    return `
        <section class="player-sheet hidden" id="trade-sheet" aria-label="Trocar carta">
            <div class="player-sheet-header">
                <div>
                    <h3>Trocar carta</h3>
                    <p class="small">Digite o ID/e-mail do jogador ou leia o QR dele.</p>
                </div>
                <button class="icon-button" type="button" data-close-player-sheet title="Fechar"><i data-lucide="x"></i></button>
            </div>
            <form class="form-grid" id="trade-form">
                <div class="field">
                    <label for="trade-own-card">Sua carta</label>
                    <select id="trade-own-card" name="offered_card_id" required ${state.inventory.length ? "" : "disabled"}>
                        ${state.inventory.map((card) => `<option value="${card.id}" ${activeCard?.id === card.id ? "selected" : ""}>#${escapeHtml(card.number)} ${escapeHtml(card.name)}</option>`).join("")}
                    </select>
                </div>
                <div class="field">
                    <label for="trade-user-code">ID ou e-mail do jogador</label>
                    <div class="inline-field">
                        <input id="trade-user-code" name="to_user_code" placeholder="Cole o ID, e-mail ou leia o QR" required>
                        <button class="icon-button" id="scan-trade-user" type="button" title="Ler QR do jogador"><i data-lucide="qr-code"></i></button>
                    </div>
                        <div id="trade-qr-reader" class="mini-qr-reader hidden"></div>
                </div>
                <div class="field">
                    <label for="trade-request-card">Carta desejada</label>
                    <select id="trade-request-card" name="requested_card_id" required>
                        ${state.cards.map((card) => `<option value="${card.id}">#${escapeHtml(card.number)} ${escapeHtml(card.name)}</option>`).join("")}
                    </select>
                </div>
                <button class="primary-button" type="submit" ${state.inventory.length ? "" : "disabled"}>
                    <i data-lucide="repeat-2"></i> Enviar troca
                </button>
            </form>
            <div class="treasure-list compact-list">
                ${tradeListTemplate()}
            </div>
        </section>
        <section class="player-sheet hidden" id="redeem-sheet" aria-label="Resgatar valor">
            <div class="player-sheet-header">
                <div>
                    <h3>Resgatar valor</h3>
                    <p class="small">Envie a carta para analise de pagamento.</p>
                </div>
                <button class="icon-button" type="button" data-close-player-sheet title="Fechar"><i data-lucide="x"></i></button>
            </div>
            <form class="form-grid" id="house-sale-form">
                <div class="field">
                    <label for="house-sale-card">Carta</label>
                    <select id="house-sale-card" name="inventory_key" required ${state.inventory.length ? "" : "disabled"}>
                        ${state.inventory.map((card) => `<option value="${card.card_code_id || card.id}" ${activeCard?.id === card.id ? "selected" : ""}>#${escapeHtml(card.number)} ${escapeHtml(card.name)}${card.card_code_id ? " - ID unico" : ""}</option>`).join("")}
                    </select>
                </div>
                <div class="field">
                    <label for="house-sale-price">Valor pedido em R$</label>
                    <input id="house-sale-price" name="asking_price" type="number" min="0" step="0.01" value="${activeCard?.money_value || 0}" required>
                </div>
                <button class="primary-button" type="submit" ${state.inventory.length ? "" : "disabled"}>
                    <i data-lucide="wallet"></i> Solicitar resgate
                </button>
            </form>
            <div class="treasure-list compact-list">
                ${housePurchaseListTemplate()}
            </div>
        </section>
        <section class="player-sheet hidden" id="capture-sheet" aria-label="Scanear QR de cartinha">
            <div class="player-sheet-header">
                <div>
                    <h3>Scanear QR de cartinha</h3>
                    <p class="small">Use nos QR Codes fisicos espalhados para os jogadores.</p>
                </div>
                <button class="icon-button" type="button" data-close-player-sheet title="Fechar"><i data-lucide="x"></i></button>
            </div>
            <div id="qr-reader"></div>
            <div class="manual-qr">
                <div class="field">
                    <label for="manual-token">ID da cartinha</label>
                    <input id="manual-token" placeholder="Ex.: ID-SOL-0001 ou 001">
                </div>
                <button class="primary-button" id="start-scanner" type="button">
                    <i data-lucide="camera"></i> Ler QR
                </button>
                <button class="ghost-button" id="manual-validate" type="button">
                    <i data-lucide="check"></i> Validar
                </button>
            </div>
        </section>
    `;
}

function playerTemplate() {
    const redeemValue = Number(state.user.points_balance || 0) * Number(state.settings.point_cash_rate || 0);
    return `
        <section class="stats" aria-label="Resumo do jogador">
            <div class="stat"><span>Saldo</span><strong>${formatPoints(state.user.points_balance || 0)}</strong></div>
            <div class="stat"><span>Valor estimado</span><strong>${formatCurrency(redeemValue)}</strong></div>
            <div class="stat"><span>Minimo resgate</span><strong>${formatPoints(state.settings.minimum_redeem_points || 0)}</strong></div>
            <div class="stat"><span>Cartas</span><strong>${state.inventory.length}</strong></div>
        </section>
        <section class="scanner-layout">
            <div class="panel">
                <div class="panel-header">
                    <div>
                        <h3>Leitor de QR Code</h3>
                        <p class="small">Leia o QR ou digite o ID unico impresso na cartinha. Uma vez validado, ele fica bloqueado.</p>
                    </div>
                    <button class="primary-button" id="start-scanner" type="button">
                        <i data-lucide="camera"></i> Ler QR
                    </button>
                </div>
                <div id="qr-reader"></div>
                <div class="manual-qr">
                    <div class="field">
                        <label for="manual-token">Validar token manualmente</label>
                        <input id="manual-token" placeholder="Ex.: ID-SOL-0001">
                    </div>
                    <button class="ghost-button" id="manual-validate" type="button">
                        <i data-lucide="check"></i> Validar
                    </button>
                </div>
            </div>
            <div class="panel">
                <div class="panel-header">
                    <div>
                        <h3>Pistas disponiveis</h3>
                        <p class="small">${state.locations.filter((location) => location.active).length} locais ativos na campanha.</p>
                    </div>
                </div>
                <div class="treasure-list">
                    ${state.locations.filter((location) => location.active).map((location) => `
                        <article class="treasure-card">
                            <h4>${escapeHtml(location.name)}</h4>
                            <p>${escapeHtml(location.clue)}</p>
                            <span class="badge">${escapeHtml(state.cards.find((card) => card.id === location.card_id)?.rarity || "Carta")}</span>
                        </article>
                    `).join("")}
                </div>
            </div>
        </section>
        <section class="panel" style="margin-top:16px">
            <div class="panel-header">
                <div>
                    <h3>Condições da campanha</h3>
                    <p class="small">${escapeHtml(state.settings.campaign_conditions || "As condições ainda não foram configuradas pelo administrador.")}</p>
                </div>
            </div>
        </section>
        <section class="panel" style="margin-top:16px">
            <div class="panel-header">
                <div>
                    <h3>Vender cartinha para a casa</h3>
                    <p class="small">Escolha uma carta, informe o valor desejado e envie para análise do painel administrativo.</p>
                </div>
            </div>
            <form class="manual-qr" id="house-sale-form">
                <div class="field">
                    <label for="house-sale-card">Carta</label>
                    <select id="house-sale-card" name="inventory_key" required ${state.inventory.length ? "" : "disabled"}>
                        ${state.inventory.map((card) => `<option value="${card.card_code_id || card.id}">#${escapeHtml(card.number)} ${escapeHtml(card.name)}${card.card_code_id ? " - ID unico" : ""}</option>`).join("")}
                    </select>
                </div>
                <div class="field">
                    <label for="house-sale-price">Valor pedido em R$</label>
                    <input id="house-sale-price" name="asking_price" type="number" min="0" step="0.01" value="${state.inventory[0]?.money_value || 0}" required>
                </div>
                <button class="primary-button" type="submit" ${state.inventory.length ? "" : "disabled"}>
                    <i data-lucide="send"></i> Enviar venda
                </button>
            </form>
            <div class="treasure-list" style="margin-top:12px">
                ${housePurchaseListTemplate()}
            </div>
        </section>
        <section class="panel" style="margin-top:16px">
            <div class="panel-header">
                <div>
                    <h3>Inventario de cartas</h3>
                    <p class="small">${state.inventory.length} cartas conquistadas. Use baixar para salvar a imagem da pasta cartinhas.</p>
                </div>
            </div>
            <div class="card-grid">
                ${state.inventory.length ? state.inventory.map(cardTemplate).join("") : emptyInventoryTemplate()}
            </div>
        </section>
        <section class="grid two" style="margin-top:16px">
            <form class="panel" id="trade-form">
                <div class="panel-header">
                    <div>
                        <h3>Trocar cartinha</h3>
                        <p class="small">Envie uma proposta para outro jogador trocar uma carta sua por uma dele.</p>
                    </div>
                </div>
                <div class="form-grid">
                    <div class="field">
                        <label for="trade-own-card">Sua carta</label>
                        <select id="trade-own-card" name="offered_card_id" required ${state.inventory.length ? "" : "disabled"}>
                            ${state.inventory.map((card) => `<option value="${card.id}">#${escapeHtml(card.number)} ${escapeHtml(card.name)}</option>`).join("")}
                        </select>
                    </div>
                    <div class="field">
                        <label for="trade-user">Jogador</label>
                        <select id="trade-user" name="to_user_id" required>
                            ${state.users.filter((user) => user.id !== state.user.id && user.role !== "admin").map((user) => `<option value="${user.id}">${escapeHtml(user.name || user.email)}</option>`).join("")}
                        </select>
                    </div>
                    <div class="field">
                        <label for="trade-request-card">Carta desejada</label>
                        <select id="trade-request-card" name="requested_card_id" required>
                            ${state.cards.map((card) => `<option value="${card.id}">#${escapeHtml(card.number)} ${escapeHtml(card.name)}</option>`).join("")}
                        </select>
                    </div>
                    <button class="primary-button" type="submit" ${state.inventory.length ? "" : "disabled"}>
                        <i data-lucide="repeat-2"></i> Propor troca
                    </button>
                </div>
            </form>
            <div class="panel">
                <div class="panel-header">
                    <div>
                        <h3>Propostas</h3>
                        <p class="small">Aceite apenas quando quiser concluir a troca imediatamente.</p>
                    </div>
                </div>
                <div class="treasure-list">
                    ${tradeListTemplate()}
                </div>
            </div>
        </section>
    `;
}

function cardTemplate(card) {
    return `
        <article class="collectible-card" style="--card-color:${card.color || "#d99b2b"}">
            <div>
                <div class="collectible-art">
                    ${card.image_path ? `<img src="${escapeAttribute(card.image_path)}" alt="${escapeAttribute(card.name)}" onerror="this.classList.add('hidden')">` : ""}
                    ${card.image_path ? "" : `<i data-lucide="sparkles"></i>`}
                </div>
                <span class="card-number">#${escapeHtml(card.number)}</span>
                <h4>${escapeHtml(card.name)}</h4>
                <span class="badge">${escapeHtml(card.rarity)}</span>
                <span class="badge warn">${formatPoints(card.point_value)}</span>
            </div>
            <p>${escapeHtml(card.description || "Carta colecionavel desbloqueada na campanha.")}</p>
            ${card.image_path ? `
                <a class="download-link" href="${escapeAttribute(card.image_path)}" download>
                    <i data-lucide="download"></i> Baixar imagem
                </a>
            ` : ""}
        </article>
    `;
}

function emptyInventoryTemplate() {
    return `
        <article class="treasure-card">
            <h4>Nenhuma carta ainda</h4>
            <p>Escaneie um QR Code valido para liberar sua primeira recompensa digital.</p>
        </article>
    `;
}

function bindAuthEvents() {
    document.querySelectorAll("[data-auth-mode]").forEach((button) => {
        button.addEventListener("click", () => {
            state.authMode = button.dataset.authMode;
            render();
        });
    });

    document.querySelector("#auth-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await authenticate(Object.fromEntries(form.entries()));
    });
}

function bindShellEvents() {
    document.querySelectorAll("[data-view]").forEach((button) => {
        button.addEventListener("click", () => {
            if (button.disabled) return;
            state.view = button.dataset.view;
            render();
        });
    });

    document.querySelector("#logout-button").addEventListener("click", logout);

    if (state.view === "admin" && (APP_MODE === "admin" || state.user.role === "admin")) {
        document.querySelector("#settings-form").addEventListener("submit", saveSettings);
        document.querySelector("#location-form").addEventListener("submit", createLocation);
        document.querySelector("#card-form").addEventListener("submit", createCard);
        document.querySelector("#edit-card-form")?.addEventListener("submit", updateCard);
        document.querySelector("#card-code-form").addEventListener("submit", createCardCode);
        document.querySelector("#card-image-file")?.addEventListener("change", fillCardImageFromFile);
        document.querySelectorAll("[data-edit-card]").forEach((button) => {
            button.addEventListener("click", () => startEditCard(button.dataset.editCard));
        });
        document.querySelector("[data-cancel-edit-card]")?.addEventListener("click", cancelEditCard);
        document.querySelectorAll("[data-copy-code]").forEach((button) => {
            button.addEventListener("click", () => copyCodeToClipboard(button.dataset.copyCode));
        });
        document.querySelectorAll("[data-toggle-location]").forEach((button) => {
            button.addEventListener("click", () => toggleLocation(button.dataset.toggleLocation));
        });
        document.querySelectorAll("[data-toggle-card-code]").forEach((button) => {
            button.addEventListener("click", () => toggleCardCodeActive(button.dataset.toggleCardCode));
        });
        document.querySelectorAll("[data-approve-house-purchase]").forEach((button) => {
            button.addEventListener("click", () => approveHousePurchase(button.dataset.approveHousePurchase));
        });
        document.querySelectorAll("[data-reject-house-purchase]").forEach((button) => {
            button.addEventListener("click", () => rejectHousePurchase(button.dataset.rejectHousePurchase));
        });
    } else if (state.view === "player") {
        document.querySelector("#trade-form").addEventListener("submit", createTradeOffer);
        document.querySelector("#house-sale-form").addEventListener("submit", createHouseSaleRequest);
        document.querySelector("#open-trade-button")?.addEventListener("click", () => openPlayerSheet("trade-sheet"));
        document.querySelector("#open-redeem-button")?.addEventListener("click", () => openPlayerSheet("redeem-sheet"));
        document.querySelector("#open-capture-button")?.addEventListener("click", () => openPlayerSheet("capture-sheet"));
        document.querySelector("#player-sheet-backdrop")?.addEventListener("click", closePlayerSheets);
        document.querySelectorAll("[data-close-player-sheet]").forEach((button) => {
            button.addEventListener("click", closePlayerSheets);
        });
        document.querySelector("#scan-trade-user")?.addEventListener("click", startTradeUserScanner);
        document.querySelectorAll("[data-focus-trade]").forEach((button) => {
            button.addEventListener("click", () => focusTradeCard(button.dataset.focusTrade));
        });
        document.querySelectorAll("[data-focus-redeem]").forEach((button) => {
            button.addEventListener("click", () => focusRedeemCard(button.dataset.focusRedeem));
        });
        document.querySelectorAll("[data-accept-trade]").forEach((button) => {
            button.addEventListener("click", () => acceptTradeOffer(button.dataset.acceptTrade));
        });
        document.querySelectorAll("[data-cancel-trade]").forEach((button) => {
            button.addEventListener("click", () => cancelTradeOffer(button.dataset.cancelTrade));
        });
        document.querySelector("#start-scanner").addEventListener("click", startScanner);
        document.querySelector("#manual-validate").addEventListener("click", () => {
            const token = document.querySelector("#manual-token").value.trim();
            validateQrToken(token);
        });
    }
}

function fillCardImageFromFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const valid = /\.(jpe?g|png)$/i.test(file.name);
    if (!valid) {
        event.target.value = "";
        showToast("Escolha uma imagem JPG, JPEG ou PNG.");
        return;
    }

    const imageInput = document.querySelector("#card-image");
    if (imageInput) imageInput.value = `cartinhas/${file.name}`;
}

async function copyCodeToClipboard(value) {
    const text = String(value || "").trim();
    if (!text) return;

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
        } else {
            const input = document.createElement("input");
            input.value = text;
            input.setAttribute("readonly", "");
            input.style.position = "fixed";
            input.style.opacity = "0";
            document.body.appendChild(input);
            input.select();
            document.execCommand("copy");
            input.remove();
        }
        showToast("Codigo copiado.");
    } catch (error) {
        showToast("Nao foi possivel copiar automaticamente.");
    }
}

function normalizeCardImagePath(value) {
    const path = String(value || "").trim().replaceAll("\\", "/");
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return normalizeExternalImageUrl(path);
    if (/^(data:|cartinhas\/)/i.test(path)) return path;
    return `cartinhas/${path.replace(/^\/+/, "")}`;
}

function normalizeExternalImageUrl(path) {
    try {
        const url = new URL(path);
        const host = url.hostname.toLowerCase();
        if (host === "dropbox.com" || host.endsWith(".dropbox.com")) {
            url.protocol = "https:";
            url.hostname = "dl.dropboxusercontent.com";
            url.searchParams.delete("dl");
            url.searchParams.delete("raw");
            return url.toString();
        }
    } catch (error) {
        return path;
    }

    return path;
}

function openPlayerSheet(sheetId) {
    closePlayerSheets({ keepBackdrop: true });
    document.querySelector(`#${sheetId}`)?.classList.remove("hidden");
    document.querySelector("#player-sheet-backdrop")?.classList.remove("hidden");

    if (sheetId === "capture-sheet") document.querySelector("#manual-token")?.focus();
    if (sheetId === "trade-sheet") document.querySelector("#trade-user-code")?.focus();
}

function closePlayerSheets(options = {}) {
    stopScanner();
    document.querySelectorAll(".player-sheet").forEach((sheet) => sheet.classList.add("hidden"));
    if (!options.keepBackdrop) document.querySelector("#player-sheet-backdrop")?.classList.add("hidden");
}

function focusTradeCard(cardId) {
    openPlayerSheet("trade-sheet");
    const select = document.querySelector("#trade-own-card");
    if (select) select.value = cardId;
}

function focusRedeemCard(inventoryKey) {
    openPlayerSheet("redeem-sheet");
    const select = document.querySelector("#house-sale-card");
    if (select) select.value = inventoryKey;
}

async function authenticate(payload) {
    try {
        if (supabaseClient) {
            if (state.authMode === "register") {
                const role = isSupabaseConfigured ? "player" : payload.role || "player";
                const { data, error } = await supabaseClient.auth.signUp({
                    email: payload.email,
                    password: payload.password,
                    options: { data: { name: payload.name, role } }
                });
                if (error) throw error;

                if (data.user) {
                    await supabaseClient.from("profiles").upsert({
                        id: data.user.id,
                        name: payload.name,
                        email: payload.email,
                        role
                    });
                }
                showToast("Cadastro enviado. Confira o e-mail se a confirmacao estiver ativa.");
            } else {
                const { data, error } = await supabaseClient.auth.signInWithPassword({
                    email: payload.email,
                    password: payload.password
                });
                if (error) throw error;
                state.user = await getSupabaseProfile(data.user);
                state.view = resolveViewForUser(state.user);
            }
        } else {
            const users = storage.read("ct_users", demoUsers);
            let user = users.find((item) => item.email.toLowerCase() === payload.email.toLowerCase());

            if (state.authMode === "register") {
                user = {
                    id: crypto.randomUUID(),
                    name: payload.name,
                    email: payload.email,
                    role: payload.role || "player"
                };
                users.push(user);
                storage.write("ct_users", users);
            }

            if (!user) throw new Error("Usuario demo nao encontrado. Cadastre uma nova conta ou use admin@demo.local.");
            state.user = user;
            storage.write("ct_session", user);
            state.view = resolveViewForUser(user);
        }

        await refreshData();
        render();
        setupRealtimeSync();
        await consumePendingQrToken();
    } catch (error) {
        showToast(error.message || "Nao foi possivel autenticar.");
    }
}

async function logout() {
    await stopScanner();
    await clearRealtimeSync();
    if (supabaseClient) await supabaseClient.auth.signOut();
    localStorage.removeItem("ct_session");
    state.user = null;
    state.view = "auth";
    render();
}

async function saveSettings(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const settings = {
        id: 1,
        point_cash_rate: Number(form.get("point_cash_rate") || 0),
        minimum_redeem_points: Number(form.get("minimum_redeem_points") || 0),
        campaign_conditions: form.get("campaign_conditions") || ""
    };

    if (supabaseClient) {
        const { error } = await supabaseClient.from("app_settings").upsert(settings);
        if (error) return showToast(error.message);
    } else {
        storage.write("ct_settings", settings);
    }

    await refreshData();
    showToast("Configuracoes salvas.");
    render();
}

async function createLocation(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const location = {
        id: crypto.randomUUID(),
        name: form.get("name"),
        clue: form.get("clue"),
        qr_token: form.get("qr_token"),
        card_id: form.get("card_id"),
        active: true
    };

    if (supabaseClient) {
        const { error } = await supabaseClient.from("treasure_locations").insert(location);
        if (error) return showToast(error.message);
    } else {
        const locations = storage.read("ct_locations", demoLocations);
        locations.unshift(location);
        storage.write("ct_locations", locations);
    }

    await refreshData();
    showToast("Local cadastrado.");
    render();
}

async function createCard(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const number = String(form.get("number")).padStart(3, "0");
    const isFake = form.get("is_fake") === "on";
    const card = {
        id: crypto.randomUUID(),
        number,
        name: form.get("name"),
        rarity: form.get("rarity"),
        point_value: isFake ? 0 : Number(form.get("point_value") || 0),
        money_value: isFake ? 0 : Number(form.get("money_value") || 0),
        image_path: normalizeCardImagePath(form.get("image_path") || `cartinhas/${number}.jpg`),
        qr_token: form.get("qr_token") || `CARD-${number}`,
        color: form.get("color"),
        description: form.get("description"),
        is_fake: isFake
    };
    const initialCodeValue = String(form.get("initial_code") || "").trim().toUpperCase();
    const initialCode = initialCodeValue ? {
        id: crypto.randomUUID(),
        card_id: card.id,
        code: initialCodeValue,
        active: true,
        claimed_by: null,
        claimed_device_id: null,
        claimed_at: null
    } : null;

    if (!initialCode) return showToast("Informe o ID/QR da cartinha fisica.");
    if (state.cardCodes.some((item) => String(item.code || "").toUpperCase() === initialCode.code)) {
        return showToast("Este ID de cartinha ja esta cadastrado.");
    }

    if (supabaseClient) {
        const { error: cardError } = await supabaseClient.from("cards").insert(card);
        if (cardError) return showToast(cardError.message);

        const { error: codeError } = await supabaseClient.from("card_codes").insert(initialCode);
        if (codeError) return showToast(`Carta criada, mas o ID nao foi salvo: ${codeError.message}`);
    } else {
        const cards = storage.read("ct_cards", demoCards);
        const codes = storage.read("ct_card_codes", demoCardCodes);
        if (codes.some((item) => item.code === initialCode.code)) {
            return showToast("Este ID de cartinha ja esta cadastrado.");
        }
        cards.push(card);
        storage.write("ct_cards", cards);
        codes.unshift(initialCode);
        storage.write("ct_card_codes", codes);
    }

    await refreshData();
    showToast("Carta criada com ID e QR fisico.");
    render();
}

async function createCardCode(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const code = {
        id: crypto.randomUUID(),
        card_id: form.get("card_id"),
        code: String(form.get("code") || "").trim().toUpperCase(),
        active: true,
        claimed_by: null,
        claimed_device_id: null,
        claimed_at: null
    };

    if (!code.code) return showToast("Informe o ID da cartinha.");

    if (supabaseClient) {
        const { error } = await supabaseClient.from("card_codes").insert(code);
        if (error) return showToast(error.message);
    } else {
        const codes = storage.read("ct_card_codes", demoCardCodes);
        if (codes.some((item) => item.code === code.code)) {
            return showToast("Este ID ja esta cadastrado.");
        }
        codes.unshift(code);
        storage.write("ct_card_codes", codes);
    }

    await refreshData();
    showToast("ID unico cadastrado.");
    render();
}

async function updateCard(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const cardId = form.get("id");
    const isFake = form.get("is_fake") === "on";
    const updates = {
        name: form.get("name"),
        rarity: form.get("rarity"),
        point_value: isFake ? 0 : Number(form.get("point_value") || 0),
        money_value: isFake ? 0 : Number(form.get("money_value") || 0),
        image_path: normalizeCardImagePath(form.get("image_path")),
        color: form.get("color"),
        description: form.get("description"),
        is_fake: isFake
    };

    if (supabaseClient) {
        const { error } = await supabaseClient
            .from("cards")
            .update(updates)
            .eq("id", cardId);
        if (error) return showToast(error.message);
    } else {
        const cards = storage.read("ct_cards", demoCards).map((card) => (
            card.id === cardId ? { ...card, ...updates } : card
        ));
        storage.write("ct_cards", cards);
    }

    state.editingCardId = null;
    await refreshData();
    showToast("Carta atualizada.");
    render();
}

function startEditCard(cardId) {
    state.editingCardId = cardId;
    render();
    setTimeout(() => {
        document.querySelector("#edit-card-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
}

function cancelEditCard() {
    state.editingCardId = null;
    render();
}

async function toggleLocation(locationId) {
    const location = state.locations.find((item) => item.id === locationId);
    if (!location) return;

    if (supabaseClient) {
        const { error } = await supabaseClient
            .from("treasure_locations")
            .update({ active: !location.active })
            .eq("id", locationId);
        if (error) return showToast(error.message);
    } else {
        const locations = state.locations.map((item) => item.id === locationId ? { ...item, active: !item.active } : item);
        storage.write("ct_locations", locations);
    }

    await refreshData();
    render();
}

async function toggleCardCodeActive(codeId) {
    const code = state.cardCodes.find((item) => item.id === codeId);
    if (!code || code.claimed_by) return;

    const nextActive = !code.active;

    if (supabaseClient) {
        const { error } = await supabaseClient
            .from("card_codes")
            .update({ active: nextActive })
            .eq("id", codeId);
        if (error) return showToast(error.message);
    } else {
        const codes = storage.read("ct_card_codes", demoCardCodes).map((item) => (
            item.id === codeId ? { ...item, active: nextActive } : item
        ));
        storage.write("ct_card_codes", codes);
    }

    await refreshData();
    showToast(nextActive ? "ID liberado para validacao." : "ID bloqueado.", "success");
    render();
}

async function startScanner() {
    if (!window.Html5Qrcode) {
        showToast("Biblioteca de QR Code nao carregada. Use o campo manual ou confira a conexao.");
        return;
    }

    if (state.scannerRunning) return;

    try {
        state.scanner = new Html5Qrcode("qr-reader");
        await state.scanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 240, height: 240 } },
            (decodedText) => validateQrToken(decodedText)
        );
        state.scannerRunning = true;
    } catch (error) {
        showToast("Nao foi possivel abrir a camera. Rode em localhost/HTTPS ou use o campo manual.");
    }
}

async function startTradeUserScanner() {
    if (!window.Html5Qrcode) {
        showToast("Biblioteca de QR Code nao carregada. Digite o ID do jogador.");
        return;
    }

    if (state.tradeScannerRunning) return;

    const reader = document.querySelector("#trade-qr-reader");
    reader?.classList.remove("hidden");

    try {
        state.tradeScanner = new Html5Qrcode("trade-qr-reader");
        await state.tradeScanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 220, height: 220 } },
            async (decodedText) => {
                const input = document.querySelector("#trade-user-code");
                if (input) input.value = parseUserToken(decodedText);
                await stopTradeUserScanner();
                showToast("ID do jogador preenchido.");
            }
        );
        state.tradeScannerRunning = true;
    } catch (error) {
        reader?.classList.add("hidden");
        showToast("Nao foi possivel abrir a camera para ler o QR do jogador.");
    }
}

async function stopTradeUserScanner() {
    if (state.tradeScanner && state.tradeScannerRunning) {
        try {
            await state.tradeScanner.stop();
            state.tradeScanner.clear();
        } catch (error) {
            console.warn(error);
        }
    }
    state.tradeScanner = null;
    state.tradeScannerRunning = false;
    document.querySelector("#trade-qr-reader")?.classList.add("hidden");
}

async function createTradeOffer(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const targetUser = resolveTradeUser(form.get("to_user_code") || form.get("to_user_id"));
    if (!targetUser) return showToast("Jogador nao encontrado. Confira o ID, e-mail ou QR.");
    if (targetUser.id === state.user.id) return showToast("Escolha outro jogador para trocar.");

    const trade = {
        id: crypto.randomUUID(),
        from_user_id: state.user.id,
        to_user_id: targetUser.id,
        offered_card_id: form.get("offered_card_id"),
        requested_card_id: form.get("requested_card_id"),
        status: "pending",
        created_at: new Date().toISOString()
    };

    if (trade.offered_card_id === trade.requested_card_id) {
        return showToast("Escolha cartas diferentes para a troca.");
    }

    if (supabaseClient) {
        const { error } = await supabaseClient.from("trade_offers").insert(trade);
        if (error) return showToast(error.message);
    } else {
        const trades = storage.read("ct_trades", []);
        trades.unshift(trade);
        storage.write("ct_trades", trades);
    }

    await refreshData();
    showToast("Proposta de troca enviada.");
    render();
}

async function createHouseSaleRequest(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const inventoryKey = form.get("inventory_key");
    const inventoryItem = state.inventory.find((item) => (item.card_code_id || item.id) === inventoryKey);
    if (!inventoryItem) return showToast("Carta nao encontrada no seu inventario.");

    const cardId = inventoryItem.id;
    const cardCodeId = inventoryItem.card_code_id || null;
    const askingPrice = Number(form.get("asking_price") || 0);
    const alreadyPending = state.housePurchases.some((purchase) => (
        purchase.user_id === state.user.id &&
        purchase.card_id === cardId &&
        (purchase.card_code_id || null) === cardCodeId &&
        purchase.status === "pending"
    ));

    if (alreadyPending) return showToast("Essa carta ja esta em analise para venda.");

    const purchase = {
        id: crypto.randomUUID(),
        user_id: state.user.id,
        card_id: cardId,
        card_code_id: cardCodeId,
        asking_price: askingPrice,
        status: "pending",
        created_at: new Date().toISOString()
    };

    if (supabaseClient) {
        const { error } = await supabaseClient.from("house_purchases").insert(purchase);
        if (error) return showToast(error.message);
    } else {
        const purchases = storage.read("ct_house_purchases", []);
        purchases.unshift(purchase);
        storage.write("ct_house_purchases", purchases);
    }

    await refreshData();
    showToast("Venda enviada para analise da casa.");
    render();
}

async function approveHousePurchase(purchaseId) {
    const purchase = state.housePurchases.find((item) => item.id === purchaseId);
    if (!purchase || purchase.status !== "pending") return;

    if (supabaseClient) {
        const blockedBefore = countBlockedReplacementCodes(purchase.card_id);
        const pointsBefore = getUserPointsBalance(purchase.user_id);
        const { error } = await supabaseClient.rpc("approve_house_purchase", { purchase_id: purchaseId });
        if (error) return showToast(error.message);
        await rotateCardCodeAfterPayment(purchase, blockedBefore);
        await ensureProfilePointsDebitedAfterPayment(purchase, pointsBefore);
    } else {
        const inventory = storage.read("ct_inventory", []).filter((item) => (
            !(item.user_id === purchase.user_id &&
                ((purchase.card_code_id && item.card_code_id === purchase.card_code_id) ||
                (!purchase.card_code_id && item.card_id === purchase.card_id)))
        ));
        storage.write("ct_inventory", inventory);

        const purchases = storage.read("ct_house_purchases", []).map((item) => (
            item.id === purchaseId ? { ...item, status: "paid", paid_at: new Date().toISOString(), approved_by: state.user.id } : item
        ));
        storage.write("ct_house_purchases", purchases);

        rotateLocalCardCodeAfterPayment(purchase);
        debitLocalUserPointsForPurchase(purchase);
    }

    await refreshData();
    showToast("Resgate pago: carta removida, saldo descontado e novo ID gerado bloqueado.", "success");
    render();
}

async function rotateCardCodeAfterPayment(purchase, blockedBefore = 0) {
    const newCode = buildReplacementCardCode(purchase.card_id);

    if (purchase.card_code_id) {
        await supabaseClient
            .from("card_codes")
            .update({ active: false })
            .eq("id", purchase.card_code_id);
    }

    const { data: blockedCodes } = await supabaseClient
        .from("card_codes")
        .select("id")
        .eq("card_id", purchase.card_id)
        .eq("active", false)
        .is("claimed_by", null);
    if ((blockedCodes || []).length > blockedBefore) return;

    const { error } = await supabaseClient.from("card_codes").insert(newCode);
    if (error) {
        showToast(`Pagamento aprovado, mas nao consegui gerar o novo ID bloqueado: ${error.message}`);
    }
}

function rotateLocalCardCodeAfterPayment(purchase) {
    const newCode = buildReplacementCardCode(purchase.card_id);
    const codes = storage.read("ct_card_codes", demoCardCodes).map((item) => (
        item.id === purchase.card_code_id ? { ...item, active: false } : item
    ));
    codes.unshift(newCode);
    storage.write("ct_card_codes", codes);
}

function buildReplacementCardCode(cardId) {
    return {
        id: crypto.randomUUID(),
        card_id: cardId,
        code: createAvailableUniqueCardCode(),
        active: false,
        claimed_by: null,
        claimed_device_id: null,
        claimed_at: null
    };
}

function countBlockedReplacementCodes(cardId) {
    return state.cardCodes.filter((code) => (
        code.card_id === cardId &&
        !code.active &&
        !code.claimed_by
    )).length;
}

function getCardPointValue(cardId) {
    const card = state.cards.find((item) => item.id === cardId);
    return Number(card?.point_value || 0);
}

function getUserPointsBalance(userId) {
    const user = state.users.find((item) => item.id === userId);
    return Number(user?.points_balance || 0);
}

async function ensureProfilePointsDebitedAfterPayment(purchase, pointsBefore) {
    const cardPoints = getCardPointValue(purchase.card_id);
    if (!cardPoints) return;

    const { data, error } = await supabaseClient
        .from("profiles")
        .select("points_balance")
        .eq("id", purchase.user_id)
        .single();
    if (error || !data) return;

    const currentPoints = Number(data.points_balance || 0);
    if (currentPoints < pointsBefore) return;

    await supabaseClient
        .from("profiles")
        .update({ points_balance: Math.max(0, currentPoints - cardPoints) })
        .eq("id", purchase.user_id);
}

function debitLocalUserPointsForPurchase(purchase) {
    const cardPoints = getCardPointValue(purchase.card_id);
    if (!cardPoints) return;

    const users = storage.read("ct_users", demoUsers).map((user) => (
        user.id === purchase.user_id
            ? { ...user, points_balance: Math.max(0, Number(user.points_balance || 0) - cardPoints) }
            : user
    ));
    storage.write("ct_users", users);
}

async function rejectHousePurchase(purchaseId) {
    const purchase = state.housePurchases.find((item) => item.id === purchaseId);
    if (!purchase || purchase.status !== "pending") return;

    if (supabaseClient) {
        const { error } = await supabaseClient
            .from("house_purchases")
            .update({ status: "rejected", approved_by: state.user.id })
            .eq("id", purchaseId);
        if (error) return showToast(error.message);
    } else {
        const purchases = storage.read("ct_house_purchases", []).map((item) => (
            item.id === purchaseId ? { ...item, status: "rejected", approved_by: state.user.id } : item
        ));
        storage.write("ct_house_purchases", purchases);
    }

    await refreshData();
    showToast("Venda recusada.");
    render();
}

async function acceptTradeOffer(tradeId) {
    const trade = state.trades.find((item) => item.id === tradeId);
    if (!trade || trade.to_user_id !== state.user.id || trade.status !== "pending") return;

    if (supabaseClient) {
        const { error } = await supabaseClient.rpc("accept_trade_offer", { offer_id: tradeId });
        if (error) return showToast(error.message);
    } else {
        const inventory = storage.read("ct_inventory", []);
        const fromOwns = inventory.find((item) => item.user_id === trade.from_user_id && item.card_id === trade.offered_card_id);
        const toOwns = inventory.find((item) => item.user_id === trade.to_user_id && item.card_id === trade.requested_card_id);

        if (!fromOwns || !toOwns) {
            return showToast("Troca indisponivel: uma das cartas nao esta mais no inventario.");
        }

        fromOwns.user_id = trade.to_user_id;
        toOwns.user_id = trade.from_user_id;
        storage.write("ct_inventory", inventory);

        const trades = storage.read("ct_trades", []).map((item) => (
            item.id === tradeId ? { ...item, status: "accepted", accepted_at: new Date().toISOString() } : item
        ));
        storage.write("ct_trades", trades);
    }

    await refreshData();
    showToast("Troca concluida.");
    render();
}

async function cancelTradeOffer(tradeId) {
    const trade = state.trades.find((item) => item.id === tradeId);
    if (!trade || trade.from_user_id !== state.user.id || trade.status !== "pending") return;

    if (supabaseClient) {
        const { error } = await supabaseClient
            .from("trade_offers")
            .update({ status: "cancelled" })
            .eq("id", tradeId)
            .eq("from_user_id", state.user.id);
        if (error) return showToast(error.message);
    } else {
        const trades = storage.read("ct_trades", []).map((item) => (
            item.id === tradeId ? { ...item, status: "cancelled" } : item
        ));
        storage.write("ct_trades", trades);
    }

    await refreshData();
    showToast("Proposta cancelada.");
    render();
}

async function stopScanner() {
    await stopTradeUserScanner();

    if (state.scanner && state.scannerRunning) {
        try {
            await state.scanner.stop();
            state.scanner.clear();
        } catch (error) {
            console.warn(error);
        }
    }
    state.scanner = null;
    state.scannerRunning = false;
}

async function validateQrToken(rawToken) {
    const token = parseQrToken(rawToken);
    if (!token) return showToast("Informe ou escaneie um token.");

    let cardCode = state.cardCodes.find((item) => item.code === token);
    const location = state.locations.find((item) => item.qr_token === token && item.active);
    const numberCard = state.cards.find((item) => String(item.number || "").toUpperCase() === token);

    if (supabaseClient && !location && !numberCard) {
        const { data, error } = await supabaseClient.rpc("claim_card_code_by_value", {
            code_value: token,
            device_id: state.deviceId,
            scanned_token: token
        });

        if (error) {
            return showToast(error.message || "ID invalido, pausado ou ja validado.");
        }

        const claim = Array.isArray(data) ? data[0] : data;
        await stopScanner();
        await refreshData();
        if (Number(claim?.point_value || 0) < 0) {
            showToast(FAKE_CARD_MESSAGE, "info");
            render();
            return;
        }
        showToast(`Carta desbloqueada: ${claim?.card_name || "Cartinha"}! +${formatPoints(claim?.point_value || 0)}`);
        render();
        return;
    }

    if (!cardCode && !location && !numberCard) return showToast("ID invalido, pausado ou nao cadastrado.");

    if (cardCode) {
        if (!cardCode.active) return showToast("Este ID de cartinha esta bloqueado.");
        if (cardCode.claimed_by && cardCode.claimed_by !== state.user.id) {
            return showToast("Esta cartinha ja foi validada por outro jogador.");
        }
        if (cardCode.claimed_by === state.user.id && cardCode.claimed_device_id !== state.deviceId) {
            return showToast("Esta cartinha ja foi validada em outro celular desta conta.");
        }
        if (cardCode.claimed_by === state.user.id) {
            return showToast("Esta cartinha ja esta vinculada a voce.");
        }
    }

    const card = cardCode
        ? state.cards.find((item) => item.id === cardCode.card_id)
        : (numberCard || state.cards.find((item) => item.id === location.card_id));
    if (!card) return showToast("A carta vinculada nao foi encontrada.");
    if (card.is_fake) {
        await stopScanner();
        showToast(FAKE_CARD_MESSAGE, "info");
        render();
        return;
    }

    const alreadyCollected = cardCode
        ? state.inventory.some((item) => item.card_code_id === cardCode.id)
        : state.inventory.some((item) => item.id === card.id);
    if (alreadyCollected) return showToast(`Voce ja possui a carta ${card.name}.`);

    try {
        await awardCard(card, location, token, cardCode);
    } catch (error) {
        return showToast(error.message || "Nao foi possivel adquirir esta carta.");
    }

    await stopScanner();
    await refreshData();
    showToast(`Carta desbloqueada: ${card.name}! +${formatPoints(card.point_value)}`);
    render();
}

async function awardCard(card, location, token, cardCode = null) {
    const acquiredAt = new Date().toISOString();
    const pointsToAdd = Number(card.point_value || 0);

    if (supabaseClient) {
        if (cardCode) {
            const { error: claimError } = await supabaseClient.rpc("claim_card_code", {
                code_id: cardCode.id,
                device_id: state.deviceId,
                scanned_token: token
            });
            if (claimError) throw new Error("Este ID ja foi validado ou nao pode mais ser usado.");
            return;
        }

        const { error: inventoryError } = await supabaseClient.from("inventory").insert({
            user_id: state.user.id,
            card_id: card.id,
            card_code_id: cardCode?.id || null,
            location_id: location?.id || null,
            acquired_at: acquiredAt
        });
        if (inventoryError) throw inventoryError;

        await supabaseClient.from("scans").insert({
            user_id: state.user.id,
            location_id: location?.id || null,
            qr_token: token,
            created_at: acquiredAt
        });
        return;
    }

    const inventory = storage.read("ct_inventory", []);
    inventory.push({
        id: crypto.randomUUID(),
        user_id: state.user.id,
        card_id: card.id,
        card_code_id: cardCode?.id || null,
        location_id: location?.id || null,
        acquired_at: acquiredAt
    });
    storage.write("ct_inventory", inventory);

    if (cardCode) {
        const codes = storage.read("ct_card_codes", demoCardCodes).map((item) => (
            item.id === cardCode.id
                ? { ...item, claimed_by: state.user.id, claimed_device_id: state.deviceId, claimed_at: acquiredAt }
                : item
        ));
        storage.write("ct_card_codes", codes);
    }

    const scans = storage.read("ct_scans", []);
    scans.unshift({
        id: crypto.randomUUID(),
        user_id: state.user.id,
        location_id: location?.id || null,
        qr_token: token,
        created_at: acquiredAt
    });
    storage.write("ct_scans", scans);

    const users = storage.read("ct_users", demoUsers).map((user) => (
        user.id === state.user.id
            ? { ...user, points_balance: Number(user.points_balance || 0) + pointsToAdd }
            : user
    ));
    storage.write("ct_users", users);
}

function tradeListTemplate() {
    const visibleTrades = state.trades.filter((trade) => trade.status === "pending");

    if (!visibleTrades.length) {
        return `
            <article class="treasure-card">
                <h4>Nenhuma proposta aberta</h4>
                <p>As propostas enviadas e recebidas aparecem aqui.</p>
            </article>
        `;
    }

    return visibleTrades.map((trade) => {
        const fromUser = state.users.find((user) => user.id === trade.from_user_id);
        const toUser = state.users.find((user) => user.id === trade.to_user_id);
        const offered = state.cards.find((card) => card.id === trade.offered_card_id);
        const requested = state.cards.find((card) => card.id === trade.requested_card_id);
        const isIncoming = trade.to_user_id === state.user.id;
        const isOutgoing = trade.from_user_id === state.user.id;

        return `
            <article class="treasure-card">
                <h4>${isIncoming ? "Proposta recebida" : "Proposta enviada"}</h4>
                <p>
                    ${escapeHtml(fromUser?.name || "Jogador")} oferece
                    <strong>#${escapeHtml(offered?.number || "-")} ${escapeHtml(offered?.name || "Carta")}</strong>
                    por
                    <strong>#${escapeHtml(requested?.number || "-")} ${escapeHtml(requested?.name || "Carta")}</strong>
                    de ${escapeHtml(toUser?.name || "jogador")}.
                </p>
                <div class="action-row">
                    ${isIncoming ? `
                        <button class="primary-button" type="button" data-accept-trade="${trade.id}">
                            <i data-lucide="check"></i> Aceitar
                        </button>
                    ` : ""}
                    ${isOutgoing ? `
                        <button class="ghost-button" type="button" data-cancel-trade="${trade.id}">
                            <i data-lucide="x"></i> Cancelar
                        </button>
                    ` : ""}
                </div>
            </article>
        `;
    }).join("");
}

function housePurchaseListTemplate() {
    const userPurchases = state.housePurchases.filter((purchase) => purchase.user_id === state.user.id);

    if (!userPurchases.length) {
        return `
            <article class="treasure-card">
                <h4>Nenhuma venda enviada</h4>
                <p>Quando voce mandar uma carta para venda, o status aparece aqui.</p>
            </article>
        `;
    }

    return userPurchases.slice(0, 4).map((purchase) => {
        const card = state.cards.find((item) => item.id === purchase.card_id);
        return `
            <article class="treasure-card">
                <h4>#${escapeHtml(card?.number || "-")} ${escapeHtml(card?.name || "Carta")}</h4>
                <p>Valor pedido: ${formatCurrency(purchase.asking_price)}</p>
                <span class="badge ${purchase.status === "pending" ? "warn" : ""}">${escapeHtml(purchase.status)}</span>
            </article>
        `;
    }).join("");
}

function normalizeCards(cards) {
    return cards.map(normalizeCard);
}

function normalizeCard(card) {
    if (!card) return card;
    const fallbackNumbers = {
        card_sol: "001",
        card_mapa: "002",
        card_floresta: "003"
    };
    const number = card.number || fallbackNumbers[card.id] || String(card.id || "").replace(/\D/g, "").slice(0, 3) || "000";
    const paddedNumber = String(number).padStart(3, "0");
    return {
        point_value: 0,
        money_value: 0,
        is_fake: false,
        image_path: `cartinhas/${paddedNumber}.png`,
        qr_token: `CARD-${paddedNumber}`,
        ...card,
        number: paddedNumber
    };
}

function getPendingQrToken() {
    const params = new URLSearchParams(window.location.search);
    return params.get("card") || params.get("qr") || params.get("token") || null;
}

async function consumePendingQrToken() {
    if (!state.user || !state.pendingQrToken) return;
    const token = state.pendingQrToken;
    state.pendingQrToken = null;
    window.history.replaceState({}, document.title, window.location.pathname);
    await validateQrToken(token);
}

function parseQrToken(rawToken) {
    const raw = String(rawToken || "").trim();
    if (!raw) return "";

    try {
        const url = new URL(raw);
        return url.searchParams.get("id") || url.searchParams.get("card") || url.searchParams.get("qr") || url.searchParams.get("token") || raw;
    } catch (error) {
        return raw.replace(/^(card|id):/i, "").trim().toUpperCase();
    }
}

function parseUserToken(rawToken) {
    const raw = String(rawToken || "").trim();
    if (!raw) return "";

    try {
        const url = new URL(raw);
        return url.searchParams.get("user") || url.searchParams.get("player") || url.searchParams.get("id") || raw;
    } catch (error) {
        return raw.replace(/^(user|player|jogador|id):/i, "").trim();
    }
}

function resolveTradeUser(value) {
    const token = parseUserToken(value).toLowerCase();
    if (!token) return null;

    return state.users.find((user) => {
        const id = String(user.id || "").toLowerCase();
        const email = String(user.email || "").toLowerCase();
        const name = String(user.name || "").toLowerCase();
        return id === token || email === token || name === token;
    }) || null;
}

function createToken() {
    return `TESOURO-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function createCardToken() {
    return `CARD-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function createUniqueCardCode() {
    return `ID-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

function createAvailableUniqueCardCode() {
    const existing = new Set(state.cardCodes.map((code) => String(code.code || "").toUpperCase()));
    let next = createUniqueCardCode();
    while (existing.has(next)) {
        next = createUniqueCardCode();
    }
    return next;
}

function getDeviceId() {
    const key = "ct_device_id";
    const current = localStorage.getItem(key);
    if (current) return current;
    const next = `DEVICE-${crypto.randomUUID()}`;
    localStorage.setItem(key, next);
    return next;
}

function formatPoints(value) {
    return `${Number(value || 0).toLocaleString("pt-BR")} pts`;
}

function formatCurrency(value) {
    return Number(value || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
}

function formatDateTime(value) {
    if (!value) return "-";
    return new Date(value).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
    return escapeHtml(value).replaceAll("`", "&#096;");
}

function showToast(message, variant = inferToastVariant(message)) {
    const previous = document.querySelector(".toast");
    if (previous) previous.remove();

    const toast = document.createElement("div");
    const icon = variant === "success" ? "check-circle-2" : (variant === "error" ? "circle-alert" : "info");
    toast.className = `toast ${variant}`;
    toast.innerHTML = `
        <span class="toast-icon"><i data-lucide="${icon}"></i></span>
        <span>${escapeHtml(message)}</span>
    `;
    document.body.appendChild(toast);

    if (window.lucide) window.lucide.createIcons();
    playAlertSound(variant);
    window.setTimeout(() => toast.remove(), 4200);
}

function inferToastVariant(message) {
    const text = String(message || "").toLowerCase();
    if (/(erro|nao|não|invalido|inválido|bloqueado|recusad|falhou|indisponivel|indisponível|ja |já )/.test(text)) {
        return "error";
    }
    if (/(concluid|criad|cadastrad|salv|enviad|desbloquead|atualizad|copiad|liberad|pago|aprovad|validado)/.test(text)) {
        return "success";
    }
    return "info";
}

function playAlertSound(variant) {
    if (variant === "error") return;

    try {
        const audio = new Audio(ALERT_AUDIO_SRC);
        audio.volume = 0.75;
        const playResult = audio.play();
        if (playResult?.catch) playResult.catch(() => {});
    } catch (error) {
        console.warn(error);
    }
}

loadSession();
