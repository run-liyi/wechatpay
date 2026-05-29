// charts.js — 图表层：Chart.js 各图表渲染（配色取自 chart-theme，DOM 解耦计算用 core/analytics）。
import Chart from 'chart.js/auto';
import * as ChartTheme from '../../chart-theme.js';
import { showCanvas } from '../dom/ui.js';

// Chart 实例缓存
const charts = {};

export function renderIncomeExpenseChart(analysis) {
    const ctx = document.getElementById('incomeExpenseChart');
    showCanvas(ctx);
    
    if (charts.incomeExpense) {
        charts.incomeExpense.destroy();
    }
    
    charts.incomeExpense = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['收入', '支出'],
            datasets: [{
                label: '金额(元)',
                data: [analysis.totalIncome, analysis.totalExpense],
                backgroundColor: [ChartTheme.SEMANTIC.income.bg, ChartTheme.SEMANTIC.expense.bg],
                borderColor: [ChartTheme.SEMANTIC.income.border, ChartTheme.SEMANTIC.expense.border],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `金额: ¥${context.parsed.y.toFixed(2)}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '¥' + value;
                        }
                    }
                }
            }
        }
    });
}

export function renderPaymentMethodChart(stats) {
    const ctx = document.getElementById('paymentMethodChart');
    showCanvas(ctx);
    
    if (charts.paymentMethod) {
        charts.paymentMethod.destroy();
    }
    
    charts.paymentMethod = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: stats.map(s => s.name),
            datasets: [{
                data: stats.map(s => s.totalAmount),
                backgroundColor: ChartTheme.generatePalette(stats.length)
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'right'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${label}: ¥${value.toFixed(2)} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

export function renderTransactionTypeChart(stats) {
    const ctx = document.getElementById('transactionTypeChart');
    showCanvas(ctx);
    
    if (charts.transactionType) {
        charts.transactionType.destroy();
    }
    
    charts.transactionType = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: stats.map(s => s.name),
            datasets: [{
                data: stats.map(s => s.count),
                backgroundColor: ChartTheme.generatePalette(stats.length)
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'right'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${label}: ${value}笔 (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

export function renderCategoryChart(stats, sortBy) {
    const ctx = document.getElementById('categoryChart');
    showCanvas(ctx);
    
    if (charts.category) {
        charts.category.destroy();
    }
    
    const dataKey = sortBy === 'amount' ? 'totalAmount' : 'count';
    const label = sortBy === 'amount' ? '金额(元)' : '交易次数';
    
    charts.category = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: stats.map(s => s.name.length > 20 ? s.name.substring(0, 20) + '...' : s.name),
            datasets: [{
                label: label,
                data: stats.map(s => s[dataKey]),
                backgroundColor: ChartTheme.PRIMARY.bg,
                borderColor: ChartTheme.PRIMARY.border,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            indexAxis: stats.length > 10 ? 'y' : 'x',
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            if (sortBy === 'amount') {
                                return `金额: ¥${context.parsed.y || context.parsed.x}`;
                            } else {
                                return `次数: ${context.parsed.y || context.parsed.x}`;
                            }
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        callback: function(value) {
                            if (sortBy === 'amount' && stats.length <= 10) {
                                return '¥' + value;
                            }
                            return value;
                        }
                    }
                },
                y: {
                    ticks: {
                        callback: function(value) {
                            if (sortBy === 'amount' && stats.length > 10) {
                                return '¥' + value;
                            }
                            return value;
                        }
                    }
                }
            }
        }
    });
}

export function renderTrendChart(trendData, dataType) {
    const ctx = document.getElementById('trendChart');
    showCanvas(ctx);
    
    if (charts.trend) {
        charts.trend.destroy();
    }
    
    const datasets = [];
    
    if (dataType === 'both' || dataType === 'income') {
        datasets.push({
            label: '收入',
            data: trendData.map(d => d.income),
            borderColor: ChartTheme.SEMANTIC.income.border,
            backgroundColor: ChartTheme.SEMANTIC.income.fill,
            tension: 0.3,
            fill: true
        });
    }
    
    if (dataType === 'both' || dataType === 'expense') {
        datasets.push({
            label: '支出',
            data: trendData.map(d => d.expense),
            borderColor: ChartTheme.SEMANTIC.expense.border,
            backgroundColor: ChartTheme.SEMANTIC.expense.fill,
            tension: 0.3,
            fill: true
        });
    }
    
    charts.trend = new Chart(ctx, {
        type: 'line',
        data: {
            labels: trendData.map(d => d.date),
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'top'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ¥${context.parsed.y.toFixed(2)}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '¥' + value;
                        }
                    }
                }
            }
        }
    });
}
