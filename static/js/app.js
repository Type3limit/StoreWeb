const $ = (sel, ctx) => (ctx || document).querySelector(sel);
const $$ = (sel, ctx) => [...(ctx || document).querySelectorAll(sel)];

const APP_BASE = (() => {
    const scripts = document.getElementsByTagName('script');
    const src = scripts[scripts.length - 1].src;
    const i = src.lastIndexOf('/static/js/app.js');
    return i > 0 ? src.substring(0, i + 1) : '/';
})();

const App = {
    productsCache: null,

    init() {
        this.loadSavedTheme();
        this.registerSW();
        this.bindTabs();
        this.bindProducts();
        this.bindStock();
        this.bindSales();
        this.bindCart();
        this.loadOverview();
    },

    bindCart() {
        const fab = $('#cart-fab');
        if (fab) fab.addEventListener('click', () => this.showCart());
    },

    registerSW() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register(APP_BASE + 'sw.js', { scope: APP_BASE });
        }
    },

    cart: [],

    addToCart(product, qty = 1, type = 'sale') {
        const exist = this.cart.find(c => c.product.id === product.id && c.type === type);
        if (exist) {
            const total = exist.qty + qty;
            if (total > product.stock) return this.toast('库存不足', 'error');
            exist.qty = total;
        } else {
            if (qty > product.stock) return this.toast('库存不足', 'error');
            this.cart.push({ product, qty, type });
        }
        this.updateCartBadge();
        this.toast(`已加入: ${product.name}`);
    },

    updateCartBadge() {
        const total = this.cart.reduce((s, c) => s + c.qty, 0);
        const fab = $('#cart-fab');
        const cnt = $('#cart-count');
        if (fab) {
            fab.style.display = total > 0 ? 'flex' : 'none';
            if (total > 0) {
                fab.classList.add('has-items');
                setTimeout(() => fab.classList.remove('has-items'), 300);
            }
        }
        if (cnt) cnt.textContent = total;
    },

    showCart() {
        if (this.cart.length === 0) return;
        const items = this.cart.map((c, i) => {
            const p = c.product;
            const price = c.type === 'free' ? 0 : p.sell_price;
            const sub = (price * c.qty).toFixed(2);
            return `<div class="cart-item">
                <div class="cart-item-info">
                    <div class="cart-item-name">${this.esc(p.name)}</div>
                    <div class="cart-item-price">${c.type === 'free' ? '赠送' : '¥'+price.toFixed(2)} / ${this.esc(p.unit)}</div>
                </div>
                <div class="cart-item-qty">
                    <button class="qty-btn cart-minus" data-i="${i}">−</button>
                    <input class="qty-val cart-qty" data-i="${i}" type="number" value="${c.qty}" min="1" max="${p.stock}">
                    <button class="qty-btn cart-plus" data-i="${i}">+</button>
                </div>
                <div class="cart-item-type">
                    <select class="cart-type" data-i="${i}">
                        <option value="sale" ${c.type === 'sale' ? 'selected' : ''}>售出</option>
                        <option value="free" ${c.type === 'free' ? 'selected' : ''}>赠送</option>
                    </select>
                </div>
                <button class="cart-item-remove" data-i="${i}">✕</button>
            </div>`;
        }).join('');

        const total = this.cart.reduce((s, c) => s + (c.type === 'free' ? 0 : c.product.sell_price * c.qty), 0);

        this.openModal(`<h3>购物车</h3>
            <div style="max-height:50vh;overflow-y:auto">${items}</div>
            <div class="cart-summary">
                <span class="cart-summary-label">合计</span>
                <span class="cart-summary-total">¥${total.toFixed(2)}</span>
            </div>
            <div class="btn-row">
                <button class="btn" id="btn-clear-cart">清空</button>
                <button class="btn" id="btn-cancel">取消</button>
                <button class="btn btn-primary" id="btn-checkout">确认结算</button>
            </div>
        `);

        const refreshCart = () => {
            let total = 0;
            this.cart.forEach((c, i) => {
                const price = c.type === 'free' ? 0 : c.product.sell_price;
                total += price * c.qty;
                $(`.cart-qty[data-i="${i}"]`).value = c.qty;
                $(`.cart-type[data-i="${i}"]`).value = c.type;
                const nameEl = $(`.cart-item[data-i]`); // won't work easily, just recalc total
            });
            total = this.cart.reduce((s, c) => s + (c.type === 'free' ? 0 : c.product.sell_price * c.qty), 0);
            const el = $('.cart-summary-total');
            if (el) el.textContent = `¥${total.toFixed(2)}`;
        };

        // Quantity steppers
        $$('#modal-box .cart-minus').forEach(b => {
            b.addEventListener('click', () => {
                const i = parseInt(b.dataset.i);
                if (this.cart[i].qty > 1) this.cart[i].qty--;
                refreshCart();
            });
        });
        $$('#modal-box .cart-plus').forEach(b => {
            b.addEventListener('click', () => {
                const i = parseInt(b.dataset.i);
                if (this.cart[i].qty < this.cart[i].product.stock) this.cart[i].qty++;
                refreshCart();
            });
        });
        $$('#modal-box .cart-qty').forEach(inp => {
            inp.addEventListener('input', () => {
                const i = parseInt(inp.dataset.i);
                let v = parseInt(inp.value) || 1;
                v = Math.max(1, Math.min(v, this.cart[i].product.stock));
                this.cart[i].qty = v;
                refreshCart();
            });
        });
        $$('#modal-box .cart-type').forEach(sel => {
            sel.addEventListener('change', () => {
                const i = parseInt(sel.dataset.i);
                this.cart[i].type = sel.value;
                const price = sel.value === 'free' ? 0 : this.cart[i].product.sell_price;
                const priceEl = $(`.cart-item:nth-child(${i+1}) .cart-item-price`);
                if (priceEl) priceEl.textContent = sel.value === 'free' ? '赠送' : `¥${price.toFixed(2)} / ${this.esc(this.cart[i].product.unit)}`;
                refreshCart();
            });
        });
        $$('#modal-box .cart-item-remove').forEach(b => {
            b.addEventListener('click', () => {
                const i = parseInt(b.dataset.i);
                this.cart.splice(i, 1);
                this.updateCartBadge();
                this.closeModal();
                if (this.cart.length > 0) this.showCart();
            });
        });

        $('#btn-clear-cart').addEventListener('click', () => {
            this.cart = [];
            this.updateCartBadge();
            this.closeModal();
        });
        $('#btn-cancel').addEventListener('click', () => this.closeModal());
        $('#btn-checkout').addEventListener('click', async () => {
            for (const c of this.cart) {
                await this.api('/api/sales', { method: 'POST', body: JSON.stringify({
                    product_id: c.product.id,
                    quantity: c.qty,
                    total_price: c.type === 'free' ? 0 : c.product.sell_price * c.qty,
                    note: c.type === 'free' ? '赠送' : ''
                })});
            }
            const summary = this.cart.map(c =>
                `${c.product.name} ×${c.qty}${c.type === 'free' ? ' 赠' : ''}`
            ).join(', ');
            this.toast(`已结算: ${summary}`);
            this.cart = [];
            this.updateCartBadge();
            this.closeModal();
            this.buzz();
            this.loadOverview();
        });
    },

    buzz() {
        if (navigator.vibrate) navigator.vibrate(15);
    },

    notify(title, body) {
        if (!('Notification' in window)) return;
        if (Notification.permission === 'granted') {
            new Notification(title, { body, icon: APP_BASE + 'static/manifest.json' });
        } else if (Notification.permission === 'default') {
            Notification.requestPermission();
        }
    },

    loadSavedTheme() {
        const saved = localStorage.getItem('storeweb-theme');
        if (saved) document.documentElement.dataset.theme = saved;
    },

    bindTabs() {
        $$('.nav-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.nav-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                $$('.tab-panel').forEach(p => p.classList.remove('active'));
                const panel = $(`#tab-${btn.dataset.tab}`);
                if (panel) panel.classList.add('active');
                const loaders = {
                    overview: 'loadOverview',
                    dashboard: 'loadDashboard',
                    products: 'loadProducts',
                    stock: 'loadStockRecords',
                    sales: 'loadSales',
                    help: 'loadHelp',
                    settings: 'loadSettings'
                };
                this[loaders[btn.dataset.tab]]();
            });
        });
    },

    async api(url, options = {}) {
        if (url.startsWith('/')) url = APP_BASE + url.slice(1);
        const isForm = options.body instanceof FormData;
        try {
            const res = await fetch(url, {
                ...options,
                headers: isForm
                    ? { ...(options.headers || {}) }
                    : { 'Content-Type': 'application/json', ...(options.headers || {}) }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '请求失败');
            return data;
        } catch (e) {
            this.toast(e.message, 'error');
            throw e;
        }
    },

    toast(msg, type = 'success') {
        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.textContent = msg;
        $('#toast-container').appendChild(el);
        setTimeout(() => { el.remove(); }, 2800);
    },

    openModal(html) {
        $('#modal-box').innerHTML = html;
        $('#modal-overlay').classList.add('show');
    },
    closeModal() {
        $('#modal-overlay').classList.remove('show');
    },

    // ---- Overview (POS) ----
    _allProducts: [],

    async loadOverview() {
        const products = await this.api('/api/products');
        this._allProducts = products;
        this._renderOverviewCards(products);
        this._renderCatFilter(products);
        this._bindOverviewSearch();
    },

    _renderOverviewCards(products) {
        const grid = $('#overview-grid');
        if (products.length === 0) {
            grid.innerHTML = '<div class="overview-empty"><div class="empty-icon">📦</div><div class="empty-text">没有匹配的商品</div></div>';
            return;
        }
        grid.innerHTML = products.map(p => {
            const stockCls = p.stock < 10 ? 'low' : p.stock < 30 ? 'mid' : 'ok';
            const soldOut = p.stock <= 0 ? ' sold-out' : '';
            const imgHtml = p.image
                ? `<img src="${this.esc(APP_BASE + p.image)}" alt="" loading="lazy">`
                : '<div class="ov-no-img">📦</div>';
            return `<div class="ov-card${soldOut}" data-pid="${p.id}">
                <div class="ov-card-img-wrap">${imgHtml}</div>
                <div class="ov-card-body">
                    <div class="ov-card-name-row">
                        <div class="ov-card-name">${this.esc(p.name)}</div>
                        <span class="ov-card-stock ${stockCls}">${p.stock <= 0 ? '售罄' : p.stock}</span>
                    </div>
                    <div class="ov-card-price-row">
                        <span class="ov-card-price">¥${p.sell_price.toFixed(2)}</span>
                        <span class="ov-card-unit">/${this.esc(p.unit)}</span>
                    </div>
                    ${soldOut ? '' : `<div class="ov-card-actions">
                        <button class="ov-act-btn sell" data-action="sale">售出</button>
                        <button class="ov-act-btn free" data-action="free">赠送</button>
                    </div>`}
                </div>
            </div>`;
        }).join('');

        grid.onclick = e => {
            const card = e.target.closest('.ov-card');
            if (!card || card.classList.contains('sold-out')) return;
            const pid = parseInt(card.dataset.pid);
            const p = products.find(x => x.id === pid);
            if (!p) return;
            const actionBtn = e.target.closest('.ov-act-btn');
            if (actionBtn && actionBtn.dataset.action === 'sale') {
                this.addToCart(p, 1, 'sale');
                return;
            }
            if (actionBtn && actionBtn.dataset.action === 'free') {
                this.addToCart(p, 1, 'free');
                return;
            }
            this.showOverviewSale(p, 1, 0);
        };

        // Context menu / long press for price edit
        grid.oncontextmenu = e => {
            const card = e.target.closest('.ov-card');
            if (!card || card.classList.contains('sold-out')) return;
            e.preventDefault();
            const pid = parseInt(card.dataset.pid);
            const p = products.find(x => x.id === pid);
            if (p) this.showQuickPriceEdit(p);
        };
        let longPressTimer;
        grid.addEventListener('touchstart', e => {
            const card = e.target.closest('.ov-card');
            if (!card || card.classList.contains('sold-out')) return;
            longPressTimer = setTimeout(() => {
                const pid = parseInt(card.dataset.pid);
                const p = products.find(x => x.id === pid);
                if (p) this.showQuickPriceEdit(p);
            }, 800);
        }, { passive: true });
        grid.addEventListener('touchend', () => clearTimeout(longPressTimer));
        grid.addEventListener('touchmove', () => clearTimeout(longPressTimer));
    },

    _renderCatFilter(products) {
        const cats = [...new Set(products.map(p => p.category).filter(Boolean))];
        const el = $('#cat-filter');
        if (cats.length === 0) { el.innerHTML = ''; return; }
        el.innerHTML = `<button class="cat-tag active" data-cat="">全部</button>${cats.map(c => `<button class="cat-tag" data-cat="${this.esc(c)}">${this.esc(c)}</button>`).join('')}`;
        el.onclick = e => {
            const tag = e.target.closest('.cat-tag');
            if (!tag) return;
            el.querySelectorAll('.cat-tag').forEach(t => t.classList.remove('active'));
            tag.classList.add('active');
            this._filterOverview();
        };
    },

    _bindOverviewSearch() {
        const input = $('#overview-search');
        if (!input) return;
        input.oninput = () => this._filterOverview();
    },

    _filterOverview() {
        const search = ($('#overview-search')?.value || '').toLowerCase();
        const cat = $('#cat-filter')?.querySelector('.cat-tag.active')?.dataset.cat || '';
        const filtered = this._allProducts.filter(p => {
            if (search && !p.name.toLowerCase().includes(search) && !(p.category || '').toLowerCase().includes(search)) return false;
            if (cat && p.category !== cat) return false;
            return true;
        });
        this._renderOverviewCards(filtered);
    },

    showQuickPriceEdit(product) {
        this.openModal(`<h3>修改售价</h3>
            <div style="font-size:15px;font-weight:600;margin-bottom:10px">${this.esc(product.name)}</div>
            <div class="form-row">
                <div class="form-group"><label>当前售价</label><div style="font-size:18px;font-weight:700;color:var(--primary)">¥${product.sell_price.toFixed(2)}</div></div>
                <div class="form-group"><label>新售价 (¥)</label><input class="input" id="f-new-price" type="number" step="0.01" min="0" value="${product.sell_price}"></div>
            </div>
            <div class="btn-row">
                <button class="btn" id="btn-cancel">取消</button>
                <button class="btn btn-primary" id="btn-save">保存</button>
            </div>
        `);
        $('#btn-cancel').addEventListener('click', () => this.closeModal());
        $('#btn-save').addEventListener('click', async () => {
            const newPrice = parseFloat($('#f-new-price').value) || 0;
            await this.api(`/api/products/${product.id}`, {
                method: 'PUT',
                body: JSON.stringify({ ...product, sell_price: newPrice })
            });
            this.closeModal();
            this.toast(`售价已更新: ¥${newPrice.toFixed(2)}`);
            this.loadOverview();
        });
    },

    showOverviewSale(product, preSell = 1, preFree = 0) {
        const stockCls = product.stock < 10 ? 'low' : product.stock < 30 ? 'mid' : 'ok';
        const imgHtml = product.image
            ? `<img src="${this.esc(APP_BASE + product.image)}" class="sale-modal-img" alt="">`
            : '';

        this.openModal(`
            <div class="sale-modal-top">
                ${imgHtml || '<div class="sale-modal-img" style="display:flex;align-items:center;justify-content:center;font-size:28px">📦</div>'}
                <div class="sale-modal-info">
                    <div class="sale-modal-name">${this.esc(product.name)}</div>
                    <div class="sale-modal-unit-price">¥${product.sell_price.toFixed(2)} / ${this.esc(product.unit)}</div>
                    <div class="sale-modal-stock ${stockCls}">库存: ${product.stock} ${this.esc(product.unit)}</div>
                </div>
            </div>
            <div class="split-row">
                <div class="split-side sell">
                    <div class="split-label">售出</div>
                    <div class="qty-stepper">
                        <button class="qty-btn" id="minus-sell">−</button>
                        <input class="qty-val" id="qty-sell" type="number" min="0" max="${product.stock}">
                        <button class="qty-btn" id="plus-sell">+</button>
                    </div>
                    <div class="split-sub" id="sub-sell">¥0</div>
                </div>
                <div class="split-side free">
                    <div class="split-label">赠送</div>
                    <div class="qty-stepper">
                        <button class="qty-btn" id="minus-free">−</button>
                        <input class="qty-val" id="qty-free" type="number" min="0" max="${product.stock}">
                        <button class="qty-btn" id="plus-free">+</button>
                    </div>
                    <div class="split-sub free-sub" id="sub-free">赠送</div>
                </div>
            </div>
            <div class="sale-total" id="sale-total-box">
                <span class="sale-total-label">合计</span>
                <span class="sale-total-value" id="sale-total">¥${(preSell > 0 ? product.sell_price * preSell : 0).toFixed(2)}</span>
            </div>
            <div class="form-group" style="margin-top:12px">
                <label>备注</label>
                <input class="input" id="f-note" placeholder="选填">
            </div>
            <div class="btn-row">
                <button class="btn" id="btn-cancel">取消</button>
                <button class="btn btn-primary" id="btn-confirm">确认</button>
            </div>
        `);

        const price = product.sell_price;
        const max = product.stock;

        const getSell = () => parseInt($('#qty-sell').value) || 0;
        const getFree = () => parseInt($('#qty-free').value) || 0;
        const setSteppers = (sell, free) => {
            const total = sell + free;
            if (total > max) { sell = Math.max(0, max - free); free = max - sell; }
            $('#qty-sell').value = sell;
            $('#qty-free').value = free;
            $('#sub-sell').textContent = sell > 0 ? `¥${(price * sell).toFixed(2)}` : '—';
            $('#sub-free').textContent = free > 0 ? `×${free} 赠送` : '—';
            $('#sale-total').textContent = sell > 0 ? `¥${(price * sell).toFixed(2)}` : '免费赠送';
            $('#sale-total-box').className = sell > 0 ? 'sale-total' : 'sale-total free';
        };

        // Init values
        setSteppers(preSell, preFree);

        const bindStepper = (idMinus, idPlus, idVal, which) => {
            $(idMinus).addEventListener('click', () => {
                const sell = getSell(), free = getFree();
                const cur = which === 'sell' ? sell : free;
                if (cur <= 0) return;
                setSteppers(which === 'sell' ? sell - 1 : sell, which === 'free' ? free - 1 : free);
            });
            $(idPlus).addEventListener('click', () => {
                const sell = getSell(), free = getFree();
                if (sell + free >= max) return;
                setSteppers(which === 'sell' ? sell + 1 : sell, which === 'free' ? free + 1 : free);
            });
            $(idVal).addEventListener('input', () => {
                let val = parseInt($(idVal).value) || 0;
                if (val < 0) val = 0;
                const sell = getSell(), free = getFree();
                const other = which === 'sell' ? free : sell;
                if (val + other > max) val = max - other;
                setSteppers(which === 'sell' ? val : sell, which === 'free' ? val : free);
            });
        };
        bindStepper('#minus-sell', '#plus-sell', '#qty-sell', 'sell');
        bindStepper('#minus-free', '#plus-free', '#qty-free', 'free');

        $('#btn-cancel').addEventListener('click', () => this.closeModal());
        $('#btn-confirm').addEventListener('click', async () => {
            const sellQ = getSell(), freeQ = getFree();
            if (sellQ + freeQ <= 0) return this.toast('请填写数量', 'error');
            if (sellQ + freeQ > max) return this.toast('数量超出库存', 'error');

            const note = $('#f-note').value.trim();
            if (sellQ > 0) {
                await this.api('/api/sales', { method: 'POST', body: JSON.stringify({
                    product_id: product.id, quantity: sellQ,
                    total_price: price * sellQ, note
                })});
            }
            if (freeQ > 0) {
                await this.api('/api/sales', { method: 'POST', body: JSON.stringify({
                    product_id: product.id, quantity: freeQ,
                    total_price: 0, note: '赠送'
                })});
            }

            this.closeModal();
            this.buzz();
            let parts = [];
            if (sellQ > 0) parts.push(`售出×${sellQ} ¥${(price * sellQ).toFixed(2)}`);
            if (freeQ > 0) parts.push(`赠送×${freeQ}`);
            this.toast(`${product.name}  ${parts.join(' + ')}`);
            this.loadOverview();
        });
    },

    // ---- Dashboard ----
    async loadDashboard() {
        const data = await this.api('/api/dashboard');
        $('#stats').innerHTML = [
            { label: '今日销售额', value: `¥${data.today_sales}`, cls: 'accent' },
            { label: '昨日对比', value: `¥${data.yesterday_sales}`, cls: '' },
            { label: '本周累计', value: `¥${data.week_sales}`, cls: '' },
            { label: '本月累计', value: `¥${data.month_sales}`, cls: 'accent' },
        ].map(s => `<div class="stat-card ${s.cls}"><span class="stat-label">${s.label}</span><span class="stat-value">${s.value}</span></div>`).join('');

        // Settlement
        $('#settlement').innerHTML = `
            <div class="settle-grid">
                <div class="settle-item"><span class="settle-label">营业额</span><span class="settle-val">¥${data.today_sales}</span></div>
                <div class="settle-item"><span class="settle-label">成本</span><span class="settle-val">¥${data.today_cost}</span></div>
                <div class="settle-item"><span class="settle-label">毛利</span><span class="settle-val accent">¥${data.today_profit}</span></div>
                <div class="settle-item"><span class="settle-label">售出订单</span><span class="settle-val">${data.today_orders_nonfree}</span></div>
                <div class="settle-item"><span class="settle-label">赠送数量</span><span class="settle-val free">${data.today_giveaways}</span></div>
                <div class="settle-item"><span class="settle-label">库存总值</span><span class="settle-val">¥${data.total_stock_value}</span></div>
            </div>
        `;

        // Low stock notification
        if (data.low_stock.length > 0) {
            const names = data.low_stock.map(p => `${p.name}(${p.stock})`).join('、');
            this.notify('低库存预警', `${names} 库存不足`);
        }

        // Top products
        const tp = data.top_products;
        if (tp.length === 0) {
            $('#top-products').innerHTML = '<div class="empty">今天还没有售出</div>';
        } else {
            $('#top-products').innerHTML = tp.map((x, i) =>
                `<div class="sale-list-item">
                    <div class="info"><span class="product">#${i+1} ${this.esc(x.name)}</span><span class="meta">${x.total_qty} 件</span></div>
                    <span class="amount">¥${x.total_amt.toFixed(2)}</span>
                </div>`
            ).join('');
        }

        const low = data.low_stock;
        if (low.length === 0) {
            $('#low-stock').innerHTML = '<div class="empty">暂无低库存商品</div>';
        } else {
            $('#low-stock').innerHTML = `<ul class="low-stock-list">${low.map(p =>
                `<li><span class="name">${this.esc(p.name)}</span><span class="count">${p.stock} ${p.unit || '个'}</span></li>`
            ).join('')}</ul>`;
        }

        const sales = data.recent_sales;
        if (sales.length === 0) {
            $('#recent-sales').innerHTML = '<div class="empty">暂无销售记录</div>';
        } else {
            $('#recent-sales').innerHTML = sales.map(s =>
                `<div class="sale-list-item">
                    <div class="info"><span class="product">${this.esc(s.name)}</span><span class="meta">${s.quantity} 个</span></div>
                    <span class="amount">¥${s.total_price.toFixed(2)}</span>
                </div>`
            ).join('');
        }
    },

    // ---- Products ----
    imgCell(image) {
        if (!image) return '<td><div class="product-thumb-placeholder">📦</div></td>';
        const url = APP_BASE + image;
        return `<td><img src="${this.esc(url)}" class="product-thumb" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="product-thumb-placeholder" style="display:none">📦</div></td>`;
    },

    async loadProducts() {
        const search = $('#product-search').value;
        const products = await this.api(`/api/products?search=${encodeURIComponent(search)}`);

        const tbody = $('#product-list');
        if (products.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty">暂无商品，点击右上角「添加商品」开始</td></tr>';
        } else {
            tbody.innerHTML = products.map(p => {
                const stockCls = p.stock < 10 ? 'low' : p.stock < 30 ? 'mid' : 'ok';
                return `<tr>
                    ${this.imgCell(p.image)}
                    <td><strong>${this.esc(p.name)}</strong></td>
                    <td>${this.esc(p.category) || '-'}</td>
                    <td>¥${p.cost_price.toFixed(2)}</td>
                    <td>¥${p.sell_price.toFixed(2)}</td>
                    <td><span class="stock-level ${stockCls}">${p.stock}</span></td>
                    <td>${this.esc(p.unit)}</td>
                    <td>
                        <div class="btn-group">
                            <button class="btn btn-xs" data-edit="${p.id}">编辑</button>
                            <button class="btn btn-xs btn-danger" data-del="${p.id}">删除</button>
                        </div>
                    </td>
                </tr>`;
            }).join('');
        }

        const cards = $('#product-cards');
        if (products.length === 0) {
            cards.innerHTML = '<div class="empty">暂无商品，点击右上角「添加商品」开始</div>';
        } else {
            cards.innerHTML = products.map(p => {
                const stockCls = p.stock < 10 ? 'low' : p.stock < 30 ? 'mid' : 'ok';
                const img = p.image
                    ? `<img src="${this.esc(APP_BASE + p.image)}" class="prod-card-img" alt="" loading="lazy" onerror="this.replaceWith(this.nextElementSibling)">`
                    : '';
                return `<div class="prod-card">
                    ${img || '<div class="prod-card-img">📦</div>'}
                    <div class="prod-card-body">
                        <div class="prod-card-title">${this.esc(p.name)}</div>
                        <div class="prod-card-meta">${this.esc(p.category) || '-'} · ¥${p.sell_price.toFixed(2)}</div>
                        <div class="prod-card-stock ${stockCls}">库存: ${p.stock} ${this.esc(p.unit)}</div>
                    </div>
                    <div class="prod-card-actions">
                        <button class="btn btn-xs" data-edit="${p.id}">编辑</button>
                        <button class="btn btn-xs btn-danger" data-del="${p.id}">删除</button>
                    </div>
                </div>`;
            }).join('');
        }
    },

    bindProducts() {
        $('#btn-add-product').addEventListener('click', () => this.showProductForm());
        $('#btn-batch-price').addEventListener('click', () => this.showBatchPrice());
        $('#product-search').addEventListener('input', () => this.loadProducts());
        $('#product-list').addEventListener('click', e => this._handleProductAction(e));
        $('#product-cards').addEventListener('click', e => this._handleProductAction(e));
    },

    _handleProductAction(e) {
        const editBtn = e.target.closest('[data-edit]');
        const delBtn = e.target.closest('[data-del]');
        if (editBtn) this.editProduct(editBtn.dataset.edit);
        if (delBtn) this.deleteProduct(delBtn.dataset.del);
    },

    showProductForm(product = null) {
        const isEdit = !!product;
        const data = product || {};
        const imgPreview = data.image
            ? `<div class="img-preview"><img src="${this.esc(APP_BASE + data.image)}" alt="当前封面"></div>`
            : '';
        this.openModal(`<h3>${isEdit ? '编辑商品' : '添加商品'}</h3>
            <div class="form-group">
                <label>封面图</label>
                <div class="img-upload">
                    ${imgPreview}
                    <input type="file" class="input" id="f-image" accept="image/*">
                </div>
            </div>
            <div class="form-group"><label>商品名称 *</label><input class="input" id="f-name" value="${this.esc(data.name || '')}" placeholder="如：发光手环"></div>
            <div class="form-row">
                <div class="form-group"><label>分类</label><select class="select" id="f-cat">${['', '手工制品', '玩具', '饰品', '日用品', '其他'].map(c => `<option value="${c}" ${data.category === c ? 'selected' : ''}>${c || '请选择'}</option>`).join('')}</select></div>
                <div class="form-group"><label>单位</label><select class="select" id="f-unit">${['个', '件', '套', '盒', '包', '对', '条'].map(u => `<option value="${u}" ${data.unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>成本价 (¥)</label><input class="input" id="f-cost" type="number" step="0.01" min="0" value="${data.cost_price || 0}"></div>
                <div class="form-group"><label>售价 (¥)</label><input class="input" id="f-sell" type="number" step="0.01" min="0" value="${data.sell_price || 0}"></div>
            </div>
            <div class="form-group"><label>初始库存</label><input class="input" id="f-stock" type="number" min="0" value="${data.stock || 0}"></div>
            <div class="btn-row">
                <button class="btn" id="btn-cancel">取消</button>
                <button class="btn btn-primary" id="btn-save">${isEdit ? '保存' : '添加'}</button>
            </div>
        `);
        $('#btn-cancel').addEventListener('click', () => this.closeModal());
        $('#btn-save').addEventListener('click', async () => {
            const name = $('#f-name').value.trim();
            if (!name) return this.toast('请输入商品名称', 'error');

            let file = $('#f-image').files[0];
            if (file) file = await this.compressImage(file);
            const method = isEdit ? 'PUT' : 'POST';
            const url = isEdit ? `/api/products/${product.id}` : '/api/products';

            if (file) {
                const fd = new FormData();
                fd.append('name', name);
                fd.append('category', $('#f-cat').value);
                fd.append('cost_price', parseFloat($('#f-cost').value) || 0);
                fd.append('sell_price', parseFloat($('#f-sell').value) || 0);
                fd.append('stock', parseInt($('#f-stock').value) || 0);
                fd.append('unit', $('#f-unit').value);
                fd.append('image', file);
                await this.api(url, { method, body: fd });
            } else {
                const payload = {
                    name,
                    category: $('#f-cat').value,
                    cost_price: parseFloat($('#f-cost').value) || 0,
                    sell_price: parseFloat($('#f-sell').value) || 0,
                    stock: parseInt($('#f-stock').value) || 0,
                    unit: $('#f-unit').value
                };
                await this.api(url, { method, body: JSON.stringify(payload) });
            }
            this.closeModal();
            this.loadProducts();
            this.toast(isEdit ? '商品已更新' : '商品已添加');
        });

        $('#f-image').addEventListener('change', () => {
            const file = $('#f-image').files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = e => {
                let el = $('#modal-box').querySelector('.img-preview');
                if (!el) {
                    el = document.createElement('div');
                    el.className = 'img-preview';
                    $('#f-image').closest('.img-upload').insertBefore(el, $('#f-image'));
                }
                el.innerHTML = `<img src="${e.target.result}" alt="预览">`;
            };
            reader.readAsDataURL(file);
        });
    },

    async editProduct(id) {
        const products = await this.api('/api/products');
        const p = products.find(x => x.id === parseInt(id));
        if (p) this.showProductForm(p);
    },

    async deleteProduct(id) {
        if (!confirm('确定删除该商品？关联的库存和销售记录也会被删除。')) return;
        await this.api(`/api/products/${id}`, { method: 'DELETE' });
        this.loadProducts();
        this.toast('商品已删除');
    },

    // ---- Stock ----
    async loadStockRecords() {
        const [products, records] = await Promise.all([
            this.api('/api/products'),
            this.api('/api/stock-records')
        ]);

        // Product stock list with quick actions
        const ptbody = $('#stock-products');
        if (products.length === 0) {
            ptbody.innerHTML = '<tr><td colspan="4" class="empty">暂无商品</td></tr>';
        } else {
            ptbody.innerHTML = products.map(p => {
                const stockCls = p.stock < 10 ? 'low' : p.stock < 30 ? 'mid' : 'ok';
                return `<tr>
                    <td><strong>${this.esc(p.name)}</strong></td>
                    <td><span class="stock-level ${stockCls}">${p.stock}</span></td>
                    <td>${this.esc(p.unit)}</td>
                    <td>
                        <div class="btn-group">
                            <button class="btn btn-xs stock-in-btn" data-pid="${p.id}" title="入库 +1">+1</button>
                            <button class="btn btn-xs stock-out-btn" data-pid="${p.id}" title="出库 -1">−1</button>
                            <button class="btn btn-xs" data-batch="${p.id}">批量</button>
                        </div>
                    </td>
                </tr>`;
            }).join('');
        }

        // History
        const tbody = $('#stock-list');
        if (records.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty">暂无操作记录</td></tr>';
        } else {
            tbody.innerHTML = records.map(r => `<tr>
                <td><strong>${this.esc(r.product_name)}</strong></td>
                <td><span class="badge badge-${r.type}">${r.type === 'in' ? '入库' : '出库'}</span></td>
                <td>${r.quantity}</td>
                <td>${this.esc(r.note) || '-'}</td>
                <td>${this.fmtTime(r.created_at)}</td>
            </tr>`).join('');
        }
    },

    bindStock() {
        // Quick +1/-1 stock actions
        $('#stock-products').addEventListener('click', e => {
            const inBtn = e.target.closest('.stock-in-btn');
            const outBtn = e.target.closest('.stock-out-btn');
            const batchBtn = e.target.closest('[data-batch]');
            if (inBtn) this.quickStock(inBtn.dataset.pid, 'in', 1);
            if (outBtn) this.quickStock(outBtn.dataset.pid, 'out', 1);
            if (batchBtn) this.showStockForm(parseInt(batchBtn.dataset.pid));
        });
    },

    async quickStock(pid, type, qty) {
        await this.api('/api/stock-records', {
            method: 'POST',
            body: JSON.stringify({ product_id: parseInt(pid), type, quantity: qty, note: '' })
        });
        this.buzz();
        this.loadStockRecords();
        this.toast(type === 'in' ? '已入库 +1' : '已出库 -1');
    },

    // ---- Batch Price ----
    bindBatchPrice() {
        const btn = $('#btn-batch-price');
        if (btn) btn.addEventListener('click', () => this.showBatchPrice());
    },

    showBatchPrice() {
        this.openModal(`<h3>全场调价</h3>
            <div class="form-group"><label>折扣率</label>
                <div class="qty-row"><div class="qty-stepper">
                    <button class="qty-btn" id="disc-minus">−</button>
                    <input class="qty-val" id="disc-val" type="number" value="100" min="1" max="100" style="width:64px">
                    <button class="qty-btn" id="disc-plus">+</button>
                </div><span style="font-size:16px;font-weight:700;margin-left:8px">%</span></div>
            </div>
            <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">
                例如输入 <b>80</b> = 全部打八折 &nbsp; 输入 <b>120</b> = 涨价 20%
            </div>
            <div class="btn-row">
                <button class="btn" id="btn-cancel">取消</button>
                <button class="btn btn-primary" id="btn-apply">确认调价</button>
            </div>
        `);
        const getVal = () => parseInt($('#disc-val').value) || 100;
        const clamp = v => Math.max(1, Math.min(200, v));
        $('#disc-minus').addEventListener('click', () => $('#disc-val').value = clamp(getVal() - 5));
        $('#disc-plus').addEventListener('click', () => $('#disc-val').value = clamp(getVal() + 5));
        $('#btn-cancel').addEventListener('click', () => this.closeModal());
        $('#btn-apply').addEventListener('click', async () => {
            const pct = getVal();
            if (pct <= 0) return this.toast('请输入有效折扣', 'error');
            if (!confirm(`确定将所有商品售价调整为原价的 ${pct}% ？`)) return;
            await this.api('/api/products/batch-price', { method: 'PUT', body: JSON.stringify({ percent: pct }) });
            this.closeModal();
            this.buzz();
            this.toast(`全场售价已调整为 ${pct}%`);
            this.loadProducts();
            this.loadOverview();
        });
    },

    async showStockForm(preSelectPid = null) {
        const products = await this.api('/api/products');
        this.openModal(`<h3>入库 / 出库</h3>
            <div class="form-group"><label>商品</label><select class="select" id="f-stock-pid">${products.map(p => `<option value="${p.id}"${p.id === preSelectPid ? ' selected' : ''}>${this.esc(p.name)} (库存: ${p.stock})</option>`).join('')}</select></div>
            <div class="form-group"><label>类型</label><select class="select" id="f-stock-type"><option value="in">入库（进货）</option><option value="out">出库（退货/损耗）</option></select></div>
            <div class="form-group"><label>数量</label><input class="input" id="f-stock-qty" type="number" min="1" value="1"></div>
            <div class="form-group"><label>备注</label><input class="input" id="f-stock-note" placeholder="选填"></div>
            <div class="btn-row">
                <button class="btn" id="btn-cancel">取消</button>
                <button class="btn btn-primary" id="btn-save">确认</button>
            </div>
        `);
        $('#btn-cancel').addEventListener('click', () => this.closeModal());
        $('#btn-save').addEventListener('click', async () => {
            const payload = {
                product_id: parseInt($('#f-stock-pid').value),
                type: $('#f-stock-type').value,
                quantity: parseInt($('#f-stock-qty').value) || 0,
                note: $('#f-stock-note').value.trim()
            };
            if (payload.quantity <= 0) return this.toast('数量必须大于0', 'error');
            await this.api('/api/stock-records', { method: 'POST', body: JSON.stringify(payload) });
            this.closeModal();
            this.loadStockRecords();
            this.toast('库存已更新');
        });
    },

    // ---- Sales ----
    async loadSales() {
        const sales = await this.api('/api/sales');
        const tbody = $('#sale-list');
        if (sales.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty">暂无销售记录</td></tr>';
            return;
        }
        tbody.innerHTML = sales.map(s => `<tr>
            <td><strong>${this.esc(s.product_name)}</strong></td>
            <td>${s.quantity}</td>
            <td>¥${s.total_price.toFixed(2)}</td>
            <td>${this.esc(s.note) || '-'}</td>
            <td>${this.fmtTime(s.created_at)}</td>
            <td><button class="btn btn-xs btn-danger" data-revert="${s.id}">回退</button></td>
        </tr>`).join('');
    },

    bindSales() {
        $('#btn-add-sale').addEventListener('click', () => this.showSaleForm());
        $('#btn-export-today').addEventListener('click', () => this.exportCSV('today'));
        $('#btn-export-all').addEventListener('click', () => this.exportCSV('all'));
        $('#sale-list').addEventListener('click', e => {
            const btn = e.target.closest('[data-revert]');
            if (btn) this.revertSale(btn.dataset.revert);
        });
    },

    exportCSV(period) {
        const base = APP_BASE.slice(-1) === '/' ? APP_BASE : APP_BASE + '/';
        window.open(base + 'api/sales/export?period=' + period, '_blank');
    },

    async revertSale(sid) {
        if (!confirm('确定回退该笔交易？库存将自动恢复。')) return;
        await this.api(`/api/sales/${sid}`, { method: 'DELETE' });
        this.loadSales();
        this.loadDashboard();
        this.toast('交易已回退，库存已恢复');
    },

    async showSaleForm() {
        const products = await this.api('/api/products');
        this.openModal(`<h3>记录销售</h3>
            <div class="form-group"><label>商品</label><select class="select" id="f-sale-pid">${products.map(p => `<option value="${p.id}" data-price="${p.sell_price}" data-stock="${p.stock}">${this.esc(p.name)} (库存: ${p.stock}, 售价: ¥${p.sell_price.toFixed(2)})</option>`).join('')}</select></div>
            <div class="form-row">
                <div class="form-group"><label>数量</label><input class="input" id="f-sale-qty" type="number" min="1" value="1"></div>
                <div class="form-group"><label>总价 (¥)</label><input class="input" id="f-sale-total" type="number" step="0.01" min="0"></div>
            </div>
            <div class="form-group"><label>备注</label><input class="input" id="f-sale-note" placeholder="选填"></div>
            <div class="btn-row">
                <button class="btn" id="btn-cancel">取消</button>
                <button class="btn btn-primary" id="btn-save">确认</button>
            </div>
        `);
        const updateTotal = () => {
            const sel = $('#f-sale-pid');
            const opt = sel.options[sel.selectedIndex];
            const price = parseFloat(opt.dataset.price) || 0;
            const qty = parseInt($('#f-sale-qty').value) || 0;
            $('#f-sale-total').value = (price * qty).toFixed(2);
        };
        $('#f-sale-pid').addEventListener('change', updateTotal);
        $('#f-sale-qty').addEventListener('input', updateTotal);
        updateTotal();

        $('#btn-cancel').addEventListener('click', () => this.closeModal());
        $('#btn-save').addEventListener('click', async () => {
            const payload = {
                product_id: parseInt($('#f-sale-pid').value),
                quantity: parseInt($('#f-sale-qty').value) || 0,
                total_price: parseFloat($('#f-sale-total').value) || 0
            };
            if (payload.quantity <= 0) return this.toast('数量必须大于0', 'error');
            await this.api('/api/sales', { method: 'POST', body: JSON.stringify(payload) });
            this.closeModal();
            this.loadSales();
            this.toast('销售已记录');
        });
    },

    // ---- Theme / Settings ----
    THEMES: [
        {
            id: 'clay', name: 'Claymorphism', desc: '软黏土风 · 琥珀暖色 · 3D 卡片',
            swatches: ['#F59E0B', '#FEF7F2', '#FFFCF9', '#3B1F0B']
        },
        {
            id: 'cyber', name: 'Cyberpunk', desc: '霓虹暗色 · 紫色光晕 · 赛博科技',
            swatches: ['#A855F7', '#0A0A1A', '#12122A', '#E8EAF6']
        },
        {
            id: 'glass', name: 'Glassmorphism', desc: '毛玻璃 · 蓝白通透 · 高级冷淡',
            swatches: ['#2563EB', '#F8FAFC', '#EFF6FF', '#0F172A']
        },
        {
            id: 'nature', name: 'Nature Green', desc: '自然绿意 · 清新明快 · 生机盎然',
            swatches: ['#059669', '#F0FDF4', '#FAFFFB', '#064E3B']
        },
        {
            id: 'vibrant', name: 'Vibrant Block', desc: '活力青蓝 · 块状投影 · 动感几何',
            swatches: ['#0891B2', '#F0FAFF', '#FFFFFF', '#164E63']
        },
        {
            id: 'brutal', name: 'Brutalism', desc: '粗野主义 · 直边高对比 · 极简硬核',
            swatches: ['#0F172A', '#FFFFFF', '#020617', '#020617']
        },
        {
            id: 'swiss', name: 'Swiss Minimal', desc: '极简瑞士 · 黑白高对比 · 零修饰',
            swatches: ['#000000', '#FAFAFA', '#FFFFFF', '#000000']
        },
        {
            id: 'oled', name: 'OLED Dark', desc: '纯黑护眼 · 霓虹绿点缀 · 省电优化',
            swatches: ['#00FF88', '#000000', '#0D0D0D', '#E8E8E8']
        },
        {
            id: 'neumorph', name: 'Neumorphism', desc: '新拟态 · 柔和浮雕 · 淡雅灰调',
            swatches: ['#7C8EB2', '#E8ECF2', '#E8ECF2', '#3A4050']
        },
        {
            id: 'vapor', name: 'Vaporwave', desc: '蒸汽波 · 粉紫渐变 · 80年代霓虹',
            swatches: ['#FF71CE', '#0D0221', '#12062E', '#E8D5F5']
        },
        {
            id: 'candy', name: 'Pastel Candy', desc: '糖果色 · 甜粉温柔 · 少女心爆棚',
            swatches: ['#FF8FAB', '#FFFAFB', '#FFFFFF', '#5D3A4A']
        },
        {
            id: 'film', name: 'Vintage Film', desc: '复古胶片 · 棕褐暖调 · 岁月质感',
            swatches: ['#D4A574', '#F5E6C8', '#FDF5E6', '#4A3525']
        },
        {
            id: 'ocean', name: 'Ocean Blue', desc: '海洋蓝调 · 清爽透亮 · 自由呼吸',
            swatches: ['#0EA5E9', '#F8FAFC', '#FFFFFF', '#0C4A6E']
        },
        {
            id: 'luxe', name: 'Midnight Gold', desc: '暗夜金 · 奢华暗色 · 高端质感',
            swatches: ['#D4AF37', '#0A0A16', '#12122A', '#E0D8C8']
        },
        {
            id: 'zen', name: 'Zen Garden', desc: '禅意 · 素雅大地色 · 平和安宁',
            swatches: ['#8B7355', '#F5F0E8', '#FDF9F3', '#3A3028']
        },
        {
            id: 'pop', name: 'Neon Pop', desc: '霓虹爆炸 · 荧光橙粉 · 高能活力',
            swatches: ['#FF006E', '#0F0F1A', '#181830', '#F0F0FF']
        },
        {
            id: 'rose', name: 'Rose Romance', desc: '浪漫玫瑰 · 暖粉柔红 · 甜蜜温柔',
            swatches: ['#E11D48', '#FFF1F2', '#FFFAFB', '#881337']
        },
        {
            id: 'sakura', name: 'Sakura', desc: '樱花粉 · 和风衬线 · 优雅日系',
            swatches: ['#EC4899', '#FDF2F8', '#FFFAFD', '#831843']
        }
    ],

    applyTheme(id) {
        document.documentElement.dataset.theme = id;
        localStorage.setItem('storeweb-theme', id);
        // Refresh active check in settings if visible
        if ($('#tab-settings') && $('#tab-settings').classList.contains('active')) {
            this.renderThemeCards();
        }
    },

    renderThemeCards() {
        const current = localStorage.getItem('storeweb-theme') || 'clay';
        const grid = $('#theme-grid');
        if (!grid) return;
        grid.innerHTML = this.THEMES.map(t => `
            <div class="theme-card${t.id === current ? ' active' : ''}" data-theme="${t.id}">
                ${t.id === current ? '<div class="theme-check">✓</div>' : ''}
                <div class="theme-swatches">${t.swatches.map(c => `<span class="theme-swatch" style="background:${c}"></span>`).join('')}</div>
                <div class="theme-name">${t.name}</div>
                <div class="theme-desc">${t.desc}</div>
            </div>
        `).join('');

        grid.querySelectorAll('.theme-card').forEach(card => {
            card.addEventListener('click', () => this.applyTheme(card.dataset.theme));
        });
    },

    loadSettings() {
        this.renderThemeCards();
    },

    loadHelp() {
        const el = $('#help-content');
        if (!el) return;
        el.innerHTML = `
<div class="help-section">
<h2>StoreWeb 操作指南</h2>
<p>夜市摆摊 · 仓储管理 · 收银一体</p>
</div>

<div class="help-card">
<div class="help-title">1. 商品总览 — 收银台</div>
<div class="help-body">
<p>默认首页，所有商品以大卡片展示（封面图 + 名称 + 售价）。</p>
<ul>
<li><b>售出/赠送</b>：点击卡片任一区域弹出销售面板。可分别输入售出数量和赠送数量，系统自动计算总价（赠送金额为 0），<b>一次确认同时写入两条记录</b>。</li>
<li><b>快捷按钮</b>：卡片底部「售出」「赠送」直达按钮，点击后弹窗预填对应数量 1。</li>
<li><b>搜索</b>：顶部搜索框输入关键字即时过滤商品。</li>
<li><b>分类筛选</b>：搜索框下方分类标签，点「玩具」只看玩具。</li>
<li><b>改价</b>：长按卡片（手机）或右键（电脑）→ 弹出快捷改价窗口，输入新售价保存。</li>
<li><b>售罄</b>：库存为 0 的商品自动灰显，不可点击。</li>
</ul>
</div>
</div>

<div class="help-card">
<div class="help-title">2. 仪表盘 — 今日结算</div>
<div class="help-body">
<ul>
<li><b>统计卡片</b>：今日销售额、昨日对比、本周累计、本月累计。</li>
<li><b>结算面板</b>：营业额 / 成本 / 毛利 / 售出订单数 / 赠送数量 / 库存总值。</li>
<li><b>热销 TOP3</b>：今日销量最高的 3 个商品排行。</li>
<li><b>低库存预警</b>：库存 < 10 的商品列表，浏览器通知提醒补货（首次使用需授权）。</li>
<li><b>最近销售</b>：最新 5 笔交易记录。</li>
</ul>
</div>
</div>

<div class="help-card">
<div class="help-title">3. 商品管理 — 增删改查</div>
<div class="help-body">
<ul>
<li><b>添加商品</b>：右上角「+ 添加商品」→ 填写名称、分类、成本价、售价、初始库存、单位，可选上传封面图。</li>
<li><b>编辑</b>：列表中每行「编辑」按钮 → 弹窗修改任意信息。</li>
<li><b>删除</b>：「删除」按钮 → 确认后删除商品及关联的库存和销售记录。</li>
<li><b>搜索</b>：顶部搜索框按名称或分类筛选。</li>
<li><b>封面图</b>：选图后浏览器本地压缩（最长边 400px）再上传，2M 带宽秒传。</li>
<li><b>全场调价</b>：「全场调价」按钮 → 输入百分比（80 = 八折，120 = 涨价20%）→ 一键批量改售价。</li>
</ul>
</div>
</div>

<div class="help-card">
<div class="help-title">4. 库存管理 — 快捷操作</div>
<div class="help-body">
<ul>
<li><b>快捷增减</b>：每个商品行有 <code>+1</code> / <code>−1</code> 按钮，点击即时入库/出库 1 件，无需弹窗。</li>
<li><b>批量操作</b>：「批量」按钮 → 弹窗选择商品、类型（入库/出库）、数量、备注。</li>
<li><b>记录追溯</b>：下半部分显示所有入库/出库操作历史。</li>
</ul>
</div>
</div>

<div class="help-card">
<div class="help-title">5. 销售记录 — 回退 & 导出</div>
<div class="help-body">
<ul>
<li><b>回退交易</b>：每行末尾「回退」按钮 → 确认后删除该笔销售，库存自动恢复。</li>
<li><b>导出今日</b>：下载今天所有销售为 CSV 文件，Excel 直接打开。</li>
<li><b>导出全部</b>：下载所有历史销售数据。</li>
<li><b>手动记录</b>：「+ 记录销售」可手动添加一笔销售（非 POS 流程）。</li>
</ul>
</div>
</div>

<div class="help-card">
<div class="help-title">6. 设置 — 主题切换</div>
<div class="help-body">
<ul>
<li>共 <b>16 种</b>视觉主题：Claymorphism / Cyberpunk / Glassmorphism / Nature Green / Vibrant Block / Brutalism / Swiss Minimal / OLED Dark / Neumorphism / Vaporwave / Pastel Candy / Vintage Film / Ocean Blue / Midnight Gold / Zen Garden / Neon Pop。</li>
<li>点击色块卡片即时切换，选择自动保存到浏览器，下次打开保持。</li>
</ul>
</div>
</div>

<div class="help-card">
<div class="help-title">7. 手机端使用</div>
<div class="help-body">
<ul>
<li><b>PWA 安装</b>：Chrome 地址栏安装按钮 / Safari 分享菜单「添加到主屏幕」，像原生 App 一样用。</li>
<li><b>安卓 APK</b>：独立 App，全屏 WebView，支持文件上传和通知权限。</li>
<li><b>震动反馈</b>：售出/赠送/库存操作确认时手机短震。</li>
<li><b>触控优化</b>：最小 44px 触控区、禁用下拉刷新、长按改价。</li>
</ul>
</div>
</div>

<div class="help-card">
<div class="help-title">8. 其他技巧</div>
<div class="help-body">
<ul>
<li><b>库存不足保护</b>：售出/出库时自动检查库存，超量会拦截提示。</li>
<li><b>售价自动计算</b>：POS 弹窗选数量后总价自动更新。</li>
<li><b>数据安全</b>：所有数据存储在服务器 SQLite 数据库，部署目录 <code>/home/ubuntu/StoreWeb/store.db</code>。建议定期备份。</li>
<li><b>服务器更新</b>：<code>cd ~/StoreWeb && git pull origin master && sudo systemctl restart storeweb</code></li>
</ul>
</div>
</div>
`;
    },

    // ---- Helpers ----
    esc(s) {
        if (!s) return '';
        const div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
    },
    fmtTime(ts) {
        if (!ts) return '';
        const d = new Date(ts.replace(' ', 'T') + (ts.includes('+') || ts.includes('Z') ? '' : 'Z'));
        if (isNaN(d.getTime())) return ts;
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    },

    compressImage(file, maxSize = 400, quality = 0.75) {
        return new Promise((resolve) => {
            if (!file.type.startsWith('image/')) return resolve(file);
            const reader = new FileReader();
            reader.onload = e => {
                const img = new Image();
                img.onload = () => {
                    let w = img.width, h = img.height;
                    if (w <= maxSize && h <= maxSize) return resolve(file);
                    const ratio = Math.min(maxSize / w, maxSize / h);
                    w = Math.round(w * ratio);
                    h = Math.round(h * ratio);
                    const canvas = document.createElement('canvas');
                    canvas.width = w; canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    canvas.toBlob(blob => {
                        resolve(blob ? new File([blob], file.name, { type: 'image/jpeg' }) : file);
                    }, 'image/jpeg', quality);
                };
                img.onerror = () => resolve(file);
                img.src = e.target.result;
            };
            reader.onerror = () => resolve(file);
            reader.readAsDataURL(file);
        });
    }
};

document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) App.closeModal();
});

document.addEventListener('DOMContentLoaded', () => App.init());
