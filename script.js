const SCRIPT_URL = ''; // Provide GAS Web App URL here after deployment

// Define authorized emails here (Optional security layer)
const AUTHORIZED_EMAILS = []; // Leave empty to allow any Google account, or add ['user1@gmail.com', 'user2@gmail.com']

let state = {
    budgets: [], // Array of {monthId, baseSalary, bonusIncome, savingsGoal}
    expenses: [],
    savings: [],
    categories: ['বাসস্থান', 'খাবার', 'যাতায়াত', 'ইউটিলিটি', 'বিনোদন', 'স্বাস্থ্যসেবা', 'ব্যক্তিগত', 'অন্যান্য'],
    currentUser: null
};

let currentMonthId = ''; // Format: YYYY-MM
let expenseChartInstance = null;
let savingsChartInstance = null;
let yearlyChartInstance = null;

const els = {
    loginScreen: document.getElementById('login-screen'),
    appContainer: document.getElementById('app-container'),
    btnLogout: document.getElementById('btn-logout'),
    globalMonthPicker: document.getElementById('global-month-picker'),
    
    loader: document.getElementById('loader'),
    
    inputSalary: document.getElementById('input-salary'),
    inputBonus: document.getElementById('input-bonus'),
    inputSavingsGoal: document.getElementById('input-savings-goal'),
    btnUpdateBudget: document.getElementById('btn-update-budget'),
    
    totalIncome: document.getElementById('total-income-display'),
    totalExpense: document.getElementById('total-expense-display'),
    totalSavings: document.getElementById('total-savings-display'),
    remainingBalance: document.getElementById('remaining-balance-display'),
    
    expenseMonthLabel: document.getElementById('expense-month-label'),
    savingsMonthLabel: document.getElementById('savings-month-label'),
    setupMonthLabel: document.getElementById('setup-month-label'),
    yearlyLabel: document.getElementById('yearly-label'),
    
    expenseForm: document.getElementById('expense-form'),
    expenseDate: document.getElementById('expense-date'),
    expenseCategory: document.getElementById('expense-category'),
    expenseAmount: document.getElementById('expense-amount'),
    expenseDesc: document.getElementById('expense-desc'),
    
    savingsForm: document.getElementById('savings-form'),
    savingsDate: document.getElementById('savings-date'),
    savingsAmount: document.getElementById('savings-amount'),
    
    categoryForm: document.getElementById('category-form'),
    newCategoryName: document.getElementById('new-category-name'),
    
    expenseList: document.getElementById('expense-list'),
    savingsList: document.getElementById('savings-list'),
    savingsProgressBar: document.getElementById('savings-progress-bar'),
    savingsGoalDisplay: document.getElementById('savings-goal-display'),
    
    tabBtns: document.querySelectorAll('.tab-btn'),
    tabContents: document.querySelectorAll('.tab-content')
};

// --- Authentication ---
function handleCredentialResponse(response) {
    const payload = parseJwt(response.credential);
    const email = payload.email;
    
    if (AUTHORIZED_EMAILS.length > 0 && !AUTHORIZED_EMAILS.includes(email)) {
        alert("অননুমোদিত অ্যাকাউন্ট।");
        return;
    }
    
    login(email);
}

function parseJwt(token) {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
}

function login(email) {
    state.currentUser = email;
    els.loginScreen.classList.add('hidden');
    els.appContainer.style.display = 'flex';
    initApp();
}

function logout() {
    state.currentUser = null;
    els.appContainer.style.display = 'none';
    els.loginScreen.classList.remove('hidden');
}

els.btnLogout.addEventListener('click', logout);

// --- Initialization ---
async function initApp() {
    const today = new Date();
    currentMonthId = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    
    els.globalMonthPicker.value = currentMonthId;
    els.expenseDate.value = today.toISOString().split('T')[0];
    els.savingsDate.value = today.toISOString().split('T')[0];

    // Setup Tabs
    els.tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            els.tabBtns.forEach(b => b.classList.remove('active'));
            els.tabContents.forEach(c => c.classList.add('hidden'));
            
            btn.classList.add('active');
            document.getElementById(btn.dataset.target).classList.remove('hidden');
            
            // Resize charts if they were hidden during render
            if (btn.dataset.target === 'dashboard-section') {
                if (yearlyChartInstance) yearlyChartInstance.resize();
                if (expenseChartInstance) expenseChartInstance.resize();
                if (savingsChartInstance) savingsChartInstance.resize();
            }
        });
    });

    els.globalMonthPicker.addEventListener('change', (e) => {
        currentMonthId = e.target.value;
        updateUI();
    });

    showLoader();
    if (SCRIPT_URL) {
        await fetchDataFromGAS();
    } else {
        loadLocalFallback();
    }
    hideLoader();
    updateUI();
}

function showLoader() { els.loader.classList.remove('hidden'); }
function hideLoader() { els.loader.classList.add('hidden'); }

// --- API Functions ---
async function fetchDataFromGAS() {
    try {
        const response = await fetch(`${SCRIPT_URL}?action=getData`);
        const result = await response.json();
        if (result.status === 'success') {
            state.budgets = result.data.budgets || [];
            state.expenses = result.data.expenses || [];
            state.savings = result.data.savings || [];
            state.categories = result.data.categories || state.categories;
        }
    } catch (e) {
        console.error('Failed to fetch from GAS', e);
        loadLocalFallback();
    }
}

async function postDataToGAS(action, data) {
    if (!SCRIPT_URL) {
        saveLocalFallback();
        return;
    }
    try {
        await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action, data })
        });
    } catch (e) {
        console.error('Failed to post to GAS', e);
        saveLocalFallback();
    }
}

function loadLocalFallback() {
    const saved = localStorage.getItem('expenseTrackerData');
    if (saved) {
        const parsed = JSON.parse(saved);
        state.budgets = parsed.budgets || [];
        state.expenses = parsed.expenses || [];
        state.savings = parsed.savings || [];
        state.categories = parsed.categories || state.categories;
    }
}

function saveLocalFallback() {
    localStorage.setItem('expenseTrackerData', JSON.stringify(state));
}

// --- Helper Functions ---
function getMonthLabel(monthId) {
    if (!monthId) return '';
    const [year, month] = monthId.split('-');
    const date = new Date(year, month - 1);
    // Bengali format
    return date.toLocaleString('bn-BD', { month: 'long', year: 'numeric' });
}

const formatNumberBN = (num) => {
    return new Intl.NumberFormat('bn-BD').format(num);
};

// --- UI Update & Charts ---
function updateUI() {
    // 1. Filter Data for Current Month
    const monthExpenses = state.expenses.filter(e => e.date.startsWith(currentMonthId));
    const monthSavings = state.savings.filter(e => e.date.startsWith(currentMonthId));
    
    let currentBudget = state.budgets.find(b => b.monthId === currentMonthId);
    if (!currentBudget) {
        currentBudget = { monthId: currentMonthId, baseSalary: 0, bonusIncome: 0, savingsGoal: 0 };
    }

    const totalIncome = Number(currentBudget.baseSalary) + Number(currentBudget.bonusIncome);
    const totalExpenses = monthExpenses.reduce((sum, item) => sum + Number(item.amount), 0);
    const totalSaved = monthSavings.reduce((sum, item) => sum + Number(item.amount), 0);
    const remaining = totalIncome - totalExpenses - totalSaved;

    // 2. Update Dashboard Cards
    els.totalIncome.textContent = `৳ ${formatNumberBN(totalIncome)}`;
    els.totalExpense.textContent = `৳ ${formatNumberBN(totalExpenses)}`;
    els.totalSavings.textContent = `৳ ${formatNumberBN(totalSaved)}`;
    els.remainingBalance.textContent = `৳ ${formatNumberBN(remaining)}`;
    
    // 3. Update Inputs & Labels
    els.inputSalary.value = currentBudget.baseSalary || '';
    els.inputBonus.value = currentBudget.bonusIncome || '';
    els.inputSavingsGoal.value = currentBudget.savingsGoal || '';
    
    const mLabel = getMonthLabel(currentMonthId);
    els.expenseMonthLabel.textContent = mLabel;
    els.savingsMonthLabel.textContent = mLabel;
    els.setupMonthLabel.textContent = mLabel;
    
    const bnYear = new Date(currentMonthId.split('-')[0], 0).toLocaleString('bn-BD', { year: 'numeric' });
    els.yearlyLabel.textContent = bnYear;

    // 4. Update Progress Bar
    let progress = 0;
    if (currentBudget.savingsGoal > 0) {
        progress = (totalSaved / currentBudget.savingsGoal) * 100;
        if (progress > 100) progress = 100;
    }
    els.savingsProgressBar.style.width = `${progress}%`;
    els.savingsGoalDisplay.textContent = `৳ ${formatNumberBN(currentBudget.savingsGoal)}`;

    // 5. Render Categories Dropdown
    els.expenseCategory.innerHTML = '<option value="" disabled selected>ক্যাটাগরি নির্বাচন করুন</option>';
    state.categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        els.expenseCategory.appendChild(opt);
    });

    // 6. Render Lists
    renderList(monthExpenses, els.expenseList, 'expense');
    renderList(monthSavings, els.savingsList, 'savings');
    
    // 7. Update Charts
    updateCharts(monthExpenses, totalSaved, currentBudget.savingsGoal);
    updateYearlyChart(currentMonthId.split('-')[0]);
}

function renderList(items, container, type) {
    container.innerHTML = '';
    const sorted = [...items].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    if (sorted.length === 0) {
        container.innerHTML = '<p class="text-sm" style="padding:0.5rem;">কোনো রেকর্ড পাওয়া যায়নি।</p>';
        return;
    }

    sorted.forEach(item => {
        const div = document.createElement('div');
        div.className = 'list-item';
        
        let metaHtml = '';
        if (type === 'expense') {
            metaHtml = `<span class="category-badge">${item.category}</span> <span>${item.date}</span>`;
        } else {
            metaHtml = `<span>${item.date}</span>`;
        }

        div.innerHTML = `
            <div class="item-info">
                <span class="item-title">${item.description || (type === 'expense' ? item.category : 'সঞ্চয় জমা')}</span>
                <div class="item-meta">${metaHtml}</div>
            </div>
            <div class="item-amount ${type}">৳ ${formatNumberBN(item.amount)}</div>
        `;
        container.appendChild(div);
    });
}

function updateCharts(monthExpenses, totalSaved, savingsGoal) {
    // 1. Expense Breakdown Chart
    const categoryTotals = {};
    monthExpenses.forEach(exp => {
        if (!categoryTotals[exp.category]) categoryTotals[exp.category] = 0;
        categoryTotals[exp.category] += Number(exp.amount);
    });
    
    const expLabels = Object.keys(categoryTotals);
    const expData = Object.values(categoryTotals);
    
    const expCtx = document.getElementById('expenseChart').getContext('2d');
    if (expenseChartInstance) expenseChartInstance.destroy();
    
    expenseChartInstance = new Chart(expCtx, {
        type: 'doughnut',
        data: {
            labels: expLabels.length ? expLabels : ['কোনো খরচ নেই'],
            datasets: [{
                data: expData.length ? expData : [1],
                backgroundColor: expData.length ? [
                    '#8b5cf6', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16'
                ] : ['#334155'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'right', labels: { color: '#f8fafc', font: { family: 'Outfit', size: 10 } } } },
            cutout: '70%'
        }
    });

    // 2. Savings Progress Chart
    const goal = Number(savingsGoal) || 0;
    const remainingGoal = Math.max(0, goal - totalSaved);
    
    const savCtx = document.getElementById('savingsChart').getContext('2d');
    if (savingsChartInstance) savingsChartInstance.destroy();

    savingsChartInstance = new Chart(savCtx, {
        type: 'bar',
        data: {
            labels: ['সঞ্চয়'],
            datasets: [
                { label: 'সঞ্চিত', data: [totalSaved], backgroundColor: '#10b981', borderRadius: 4 },
                { label: 'বাকি', data: [remainingGoal], backgroundColor: 'rgba(16, 185, 129, 0.2)', borderRadius: 4 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            indexAxis: 'y',
            scales: {
                x: { stacked: true, display: false },
                y: { stacked: true, display: false }
            },
            plugins: { legend: { display: false } }
        }
    });
}

function updateYearlyChart(year) {
    const monthlyData = Array.from({length: 12}, () => ({ income: 0, expense: 0, saved: 0 }));
    
    // Aggregate Budgets
    state.budgets.forEach(b => {
        if (b.monthId.startsWith(year)) {
            const mIndex = parseInt(b.monthId.split('-')[1]) - 1;
            monthlyData[mIndex].income += Number(b.baseSalary) + Number(b.bonusIncome);
        }
    });
    
    // Aggregate Expenses
    state.expenses.forEach(e => {
        if (e.date.startsWith(year)) {
            const mIndex = parseInt(e.date.split('-')[1]) - 1;
            monthlyData[mIndex].expense += Number(e.amount);
        }
    });
    
    // Aggregate Savings
    state.savings.forEach(s => {
        if (s.date.startsWith(year)) {
            const mIndex = parseInt(s.date.split('-')[1]) - 1;
            monthlyData[mIndex].saved += Number(s.amount);
        }
    });

    const ctx = document.getElementById('yearlyChart').getContext('2d');
    if (yearlyChartInstance) yearlyChartInstance.destroy();
    
    yearlyChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['জানু', 'ফেব', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুল', 'আগস্ট', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'],
            datasets: [
                { label: 'আয়', data: monthlyData.map(d => d.income), backgroundColor: '#3b82f6', borderRadius: 4 },
                { label: 'খরচ', data: monthlyData.map(d => d.expense), backgroundColor: '#ef4444', borderRadius: 4 },
                { label: 'সঞ্চয়', data: monthlyData.map(d => d.saved), backgroundColor: '#10b981', borderRadius: 4 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }
            },
            plugins: { legend: { labels: { color: '#f8fafc', font: { family: 'Outfit' } } } }
        }
    });
}

// --- Event Listeners ---
els.btnUpdateBudget.addEventListener('click', async () => {
    const baseSalary = Number(els.inputSalary.value);
    const bonusIncome = Number(els.inputBonus.value);
    const savingsGoal = Number(els.inputSavingsGoal.value);
    
    let currentBudget = state.budgets.find(b => b.monthId === currentMonthId);
    if (currentBudget) {
        currentBudget.baseSalary = baseSalary;
        currentBudget.bonusIncome = bonusIncome;
        currentBudget.savingsGoal = savingsGoal;
    } else {
        state.budgets.push({ monthId: currentMonthId, baseSalary, bonusIncome, savingsGoal });
    }
    
    updateUI();
    showLoader();
    await postDataToGAS('updateBudget', { monthId: currentMonthId, baseSalary, bonusIncome, savingsGoal });
    hideLoader();
});

els.expenseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newExpense = {
        date: els.expenseDate.value,
        category: els.expenseCategory.value,
        amount: Number(els.expenseAmount.value),
        description: els.expenseDesc.value
    };
    
    state.expenses.push(newExpense);
    els.expenseAmount.value = '';
    els.expenseDesc.value = '';
    updateUI();
    
    showLoader();
    await postDataToGAS('addExpense', newExpense);
    hideLoader();
});

els.savingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newSavings = {
        date: els.savingsDate.value,
        amount: Number(els.savingsAmount.value),
        description: els.savingsDesc.value
    };
    
    state.savings.push(newSavings);
    els.savingsAmount.value = '';
    updateUI();
    
    showLoader();
    await postDataToGAS('addSavings', newSavings);
    hideLoader();
});

els.categoryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const categoryName = els.newCategoryName.value.trim();
    if (categoryName && !state.categories.includes(categoryName)) {
        const othersIndex = state.categories.indexOf('অন্যান্য');
        if (othersIndex !== -1) {
            state.categories.splice(othersIndex, 0, categoryName);
        } else {
            state.categories.push(categoryName);
        }
        els.newCategoryName.value = '';
        updateUI();
        
        showLoader();
        await postDataToGAS('addCategory', { categoryName });
        hideLoader();
    }
});
