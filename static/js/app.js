const $ = (sel, ctx) => (ctx || document).querySelector(sel);
const $$ = (sel, ctx) => [...(ctx || document).querySelectorAll(sel)];

const APP_BASE = (() => {
    const scripts = document.getElementsByTagName('script');
    const src = scripts[scripts.length - 1].src;
    const i = src.lastIndexOf('/static/js/app.js');
    return i > 0 ? src.substring(0, i + 1) : '/';
})();

const App = {
    init() {
        this.bindTabs();
        this.bindProducts();
        this.bindStock();
        this.bindSales();
        this.loadDashboard();
    },

    // ---- Tabs ----
    bindTabs() {
        $$('.nav-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.nav-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                $$('.tab-panel').forEach(p => p.classList.remove('active'));
                $(`#tab-${btn.dataset.tab}`).classList.add('active');
                const loaders = {
                    dashboard: 'loadDashboard',
                    products: 'loadProducts',
                    stock: 'loadStockRecords',
                    sales: 'loadSales'
                };
                this[loaders[btn.dataset.tab]]();
            });
        });
    },

    // ---- API helper ----
    async api(url, options = {}) {
        if (url.startsWith('/')) url = APP_BASE + url.slice(1);
        try {
            const res = await fetch(url, {
                headers: { 'Content-Type': 'application/json' },
                ...options
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '请求失败');
            return data;
        } catch (e) {
            this.toast(e.message, 'error');
            throw e;
        }
    },

    // ---- Toast ----
    toast(msg, type = 'success') {
        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.textContent = msg;
        $('#toast-container').appendChild(el);
        setTimeout(() => { el.remove(); }, 2800);
    },

    // ---- Modal ----
    openModal(title, bodyHtml) {
        $('#modal-box').innerHTML = `<h3>${title}</h3>${bodyHtml}`;
        $('#modal-overlay').classList.add('show');
    },
    closeModal() {
        $('#modal-overlay').classList.remove('show');
    },

    // ---- Dashboard ----
    async loadDashboard() {
        const data = await this.api('/api/dashboard');
        // Stats
        $('#stats').innerHTML = [
            { label: '商品总数', value: data.total_products, cls: '' },
            { label: '库存成本总值', value: `¥${data.total_stock_value}`, cls: 'accent' },
            { label: '今日销售额', value: `¥${data.today_sales}`, cls: 'accent' },
            { label: '今日订单数', value: data.today_orders, cls: '' },
        ].map(s => `<div class="stat-card ${s.cls}"><span class="stat-label">${s.label}</span><span class="stat-value">${s.value}</span></div>`).join('');

        // Low stock
        const low = data.low_stock;
        if (low.length === 0) {
            $('#low-stock').innerHTML = '<div class="empty">暂无低库存商品</div>';
        } else {
            $('#low-stock').innerHTML = `<ul class="low-stock-list">${low.map(p =>
                `<li><span class="name">${this.esc(p.name)}</span><span class="count">${p.stock} ${p.unit || '个'}</span></li>`
            ).join('')}</ul>`;
        }

        // Recent sales
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
    async loadProducts() {
        const search = $('#product-search').value;
        const products = await this.api(`/api/products?search=${encodeURIComponent(search)}`);
        const tbody = $('#product-list');
        if (products.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty">暂无商品，点击右上角「添加商品」开始</td></tr>';
            return;
        }
        tbody.innerHTML = products.map(p => {
            const stockCls = p.stock < 10 ? 'low' : p.stock < 30 ? 'mid' : 'ok';
            return `<tr>
                <td><strong>${this.esc(p.name)}</strong></td>
                <td>${this.esc(p.category) || '-'}</td>
                <td>¥${p.cost_price.toFixed(2)}</td>
                <td>¥${p.sell_price.toFixed(2)}</td>
                <td><span class="stock-level ${stockCls}">${p.stock} ${this.esc(p.unit)}</span></td>
                <td>${this.esc(p.unit)}</td>
                <td>
                    <div class="btn-group">
                        <button class="btn btn-xs" data-edit="${p.id}">编辑</button>
                        <button class="btn btn-xs btn-danger" data-del="${p.id}">删除</button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    },

    bindProducts() {
        $('#btn-add-product').addEventListener('click', () => this.showProductForm());
        $('#product-search').addEventListener('input', () => this.loadProducts());
        $('#product-list').addEventListener('click', e => {
            const editBtn = e.target.closest('[data-edit]');
            const delBtn = e.target.closest('[data-del]');
            if (editBtn) this.editProduct(editBtn.dataset.edit);
            if (delBtn) this.deleteProduct(delBtn.dataset.del);
        });
    },

    showProductForm(product = null) {
        const isEdit = !!product;
        const title = isEdit ? '编辑商品' : '添加商品';
        const data = product || {};
        this.openModal(title, `
            <div class="form-group"><label>商品名称 *</label><input class="input" id="f-name" value="${this.esc(data.name || '')}" placeholder="如：发光手环"></div>
            <div class="form-row">
                <div class="form-group"><label>分类</label><select class="select" id="f-cat">${['', '手工制品', '玩具', '饰品', '日用品', '其他'].map(c => `<option value="${c}" ${data.category === c ? 'selected' : ''}>${c || '请选择'}</option>`).join('')}</select></div>
                <div class="form-group"><label>单位</label><select class="select" id="f-unit">${['个', '件', '套', '盒', '包', '对', '条'].map(u => `<option value="${u}" ${data.unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>成本价 (¥)</label><input class="input" id="f-cost" type="number" step="0.01" value="${data.cost_price || 0}"></div>
                <div class="form-group"><label>售价 (¥)</label><input class="input" id="f-sell" type="number" step="0.01" value="${data.sell_price || 0}"></div>
            </div>
            <div class="form-group"><label>初始库存</label><input class="input" id="f-stock" type="number" value="${data.stock || 0}"></div>
            <div class="btn-row">
                <button class="btn" id="btn-cancel">取消</button>
                <button class="btn btn-primary" id="btn-save">${isEdit ? '保存' : '添加'}</button>
            </div>
        `);
        $('#btn-cancel').addEventListener('click', () => this.closeModal());
        $('#btn-save').addEventListener('click', async () => {
            const payload = {
                name: $('#f-name').value.trim(),
                category: $('#f-cat').value,
                cost_price: parseFloat($('#f-cost').value) || 0,
                sell_price: parseFloat($('#f-sell').value) || 0,
                stock: parseInt($('#f-stock').value) || 0,
                unit: $('#f-unit').value
            };
            if (!payload.name) return this.toast('请输入商品名称', 'error');
            if (isEdit) {
                await this.api(`/api/products/${product.id}`, { method: 'PUT', body: JSON.stringify(payload) });
            } else {
                await this.api('/api/products', { method: 'POST', body: JSON.stringify(payload) });
            }
            this.closeModal();
            this.loadProducts();
            this.toast(isEdit ? '商品已更新' : '商品已添加');
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
        const records = await this.api('/api/stock-records');
        const tbody = $('#stock-list');
        if (records.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty">暂无库存记录</td></tr>';
            return;
        }
        tbody.innerHTML = records.map(r => `<tr>
            <td><strong>${this.esc(r.product_name)}</strong></td>
            <td><span class="badge badge-${r.type}">${r.type === 'in' ? '入库' : '出库'}</span></td>
            <td>${r.quantity}</td>
            <td>${this.esc(r.note) || '-'}</td>
            <td>${this.fmtTime(r.created_at)}</td>
        </tr>`).join('');
    },

    bindStock() {
        $('#btn-add-stock').addEventListener('click', () => this.showStockForm());
    },

    async showStockForm() {
        const products = await this.api('/api/products');
        this.openModal('入库 / 出库', `
            <div class="form-group"><label>商品</label><select class="select" id="f-stock-pid">${products.map(p => `<option value="${p.id}">${this.esc(p.name)} (库存: ${p.stock})</option>`).join('')}</select></div>
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
            tbody.innerHTML = '<tr><td colspan="5" class="empty">暂无销售记录</td></tr>';
            return;
        }
        tbody.innerHTML = sales.map(s => `<tr>
            <td><strong>${this.esc(s.product_name)}</strong></td>
            <td>${s.quantity}</td>
            <td>¥${s.total_price.toFixed(2)}</td>
            <td>${this.esc(s.note) || '-'}</td>
            <td>${this.fmtTime(s.created_at)}</td>
        </tr>`).join('');
    },

    bindSales() {
        $('#btn-add-sale').addEventListener('click', () => this.showSaleForm());
    },

    async showSaleForm() {
        const products = await this.api('/api/products');
        this.openModal('记录销售', `
            <div class="form-group"><label>商品</label><select class="select" id="f-sale-pid">${products.map(p => `<option value="${p.id}" data-price="${p.sell_price}" data-stock="${p.stock}">${this.esc(p.name)} (库存: ${p.stock}, 售价: ¥${p.sell_price.toFixed(2)})</option>`).join('')}</select></div>
            <div class="form-row">
                <div class="form-group"><label>数量</label><input class="input" id="f-sale-qty" type="number" min="1" value="1"></div>
                <div class="form-group"><label>总价 (¥)</label><input class="input" id="f-sale-total" type="number" step="0.01"></div>
            </div>
            <div class="form-group"><label>备注</label><input class="input" id="f-sale-note" placeholder="选填"></div>
            <div class="btn-row">
                <button class="btn" id="btn-cancel">取消</button>
                <button class="btn btn-primary" id="btn-save">确认</button>
            </div>
        `);
        // Auto-calc total when qty changes
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

    // ---- Helpers ----
    esc(s) {
        if (!s) return '';
        const div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
    },
    fmtTime(ts) {
        if (!ts) return '';
        const d = new Date(ts + 'Z');
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
};

// Modal overlay click to close
document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) App.closeModal();
});

document.addEventListener('DOMContentLoaded', () => App.init());
