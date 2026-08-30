"""
bin_recommendations.py - Phase 2: Add/Upgrade/Relocate Recommendations

This module uses demand scores and historical data to generate strategic
recommendations for bin placement and capacity upgrades.

Usage:
    from optimization.bin_recommendations import generate_bin_recommendations
    recommendations_df = generate_bin_recommendations(scores_df, bins_df)
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Tuple, Optional
import json
from datetime import datetime

# ─── Constants ──────────────────────────────────────────────────────────────

# Cost estimates (in INR)
COST_ESTIMATES = {
    'UPGRADE': 450,        # Cost per upgrade (new bin + installation)
    'ADD_BIN_NEARBY': 800, # New bin installation
    'RELOCATE': 300,       # Relocation cost
    'REMOVE': 150,         # Removal cost
    'KEEP': 0
}

# Recommended capacity upgrades (based on current capacity)
CAPACITY_UPGRADE_MAP = {
    'small': {  # < 300L
        'current': 240,
        'recommended': 500,
        'category': 'Small → Medium'
    },
    'medium': {  # 300-600L
        'current': 500,
        'recommended': 660,
        'category': 'Medium → Large'
    },
    'large': {  # 600-1000L
        'current': 660,
        'recommended': 1100,
        'category': 'Large → XL'
    },
    'xl': {  # > 1000L
        'current': 1100,
        'recommended': 1100,
        'category': 'XL (keep)'
    }
}

# ─── Helper Functions ──────────────────────────────────────────────────────

def get_capacity_category(capacity: float) -> str:
    """Categorize bin capacity."""
    if capacity < 300:
        return 'small'
    elif capacity < 600:
        return 'medium'
    elif capacity < 1000:
        return 'large'
    else:
        return 'xl'

def get_upgrade_recommendation(capacity: float) -> Dict:
    """Get recommended capacity upgrade."""
    category = get_capacity_category(capacity)
    return CAPACITY_UPGRADE_MAP.get(category, CAPACITY_UPGRADE_MAP['medium'])

def calculate_roi(current_cost: float, new_cost: float, overflow_reduction: float) -> float:
    """
    Calculate Return on Investment for an upgrade.
    
    Args:
        current_cost: Current annual operational cost
        new_cost: New annual operational cost
        overflow_reduction: Expected reduction in overflow events (0-1)
    
    Returns:
        ROI as a percentage
    """
    savings = current_cost * overflow_reduction
    investment = new_cost - current_cost
    if investment <= 0:
        return 999.0
    return (savings / investment) * 100


# ─── Main Recommendation Engine ────────────────────────────────────────────

def generate_bin_recommendations(
    scores_df: pd.DataFrame,
    bins_df: pd.DataFrame,
    thresholds: Dict = None,
    max_recommendations: int = None
) -> pd.DataFrame:
    """
    Generate strategic recommendations for each bin based on demand scores.
    
    Args:
        scores_df: DataFrame from Phase 1 (bin_demand_scores.csv)
        bins_df: DataFrame with bin attributes (bins_master.csv)
        thresholds: Dict with custom thresholds (optional)
        max_recommendations: Max bins to recommend (optional)
    
    Returns:
        DataFrame with recommendations for each bin
    """
    
    # ─── Set Default Thresholds ─────────────────────────────────────────────
    if thresholds is None:
        thresholds = {
            'upgrade_score': 70,      # Score above which to consider upgrade
            'add_bin_score': 75,      # Score above which to add a bin
            'relocate_score': 20,     # Score below which to consider relocation
            'remove_score': 15,       # Score below which to consider removal
            'overflow_rate': 0.15,    # Overflow rate threshold for add/upgrade
            'capacity_small': 500,    # Capacity below which upgrade is considered
            'capacity_large': 800,    # Capacity above which relocation is considered
        }
    
    # ─── Merge Data ─────────────────────────────────────────────────────────
    # Ensure we have all necessary columns
    required_score_cols = ['bin_id', 'total_score', 'risk_level', 'zone_type', 
                           'bin_capacity_liters', 'cluster_label']
    for col in required_score_cols:
        if col not in scores_df.columns and col in bins_df.columns:
            scores_df[col] = scores_df['bin_id'].map(bins_df.set_index('bin_id')[col])
    
    # Merge scores with bin attributes. overflow_rate/festival_sensitivity
    # drive the UPGRADE/ADD_BIN branches below — pull them from bins_df too
    # when present, otherwise every bin falls through to the KEEP default.
    merge_cols = ['bin_id', 'zone_type', 'bin_capacity_liters', 'latitude', 'longitude',
                  'population_density_per_sqkm', 'nearby_restaurants_count']
    for optional_col in ('overflow_rate', 'festival_sensitivity'):
        if optional_col in bins_df.columns and optional_col not in scores_df.columns:
            merge_cols.append(optional_col)
    merged_df = scores_df.merge(
        bins_df[merge_cols],
        on='bin_id',
        how='left',
        suffixes=('', '_bins')
    )
    
    # Use bin_capacity from bins_df if available, else from scores_df
    if 'bin_capacity_liters_bins' in merged_df.columns:
        merged_df['bin_capacity_liters'] = merged_df['bin_capacity_liters_bins'].fillna(
            merged_df['bin_capacity_liters']
        )
    
    # ─── Generate Recommendations ───────────────────────────────────────────
    recommendations = []
    
    for idx, row in merged_df.iterrows():
        bin_id = row['bin_id']
        score = row.get('total_score', 50)
        risk_level = row.get('risk_level', 'MEDIUM')
        capacity = row.get('bin_capacity_liters', 500)
        zone_type = row.get('zone_type', 'unknown')
        cluster_label = row.get('cluster_label', 'low_volume_stable')
        overflow_rate = row.get('overflow_rate', 0.0)
        festival_sensitivity = row.get('festival_sensitivity', 1.0)
        
        # ─── Determine Action ──────────────────────────────────────────────
        action = 'KEEP'
        priority = 'LOW'
        reason = 'No action needed'
        recommended_capacity = capacity
        estimated_cost = 0
        expected_benefit = 'No change'
        
        # 1. UPGRADE: High score + small capacity
        if score >= thresholds['upgrade_score'] and capacity < thresholds['capacity_small']:
            action = 'UPGRADE'
            priority = 'HIGH' if score >= 80 else 'MEDIUM'
            upgrade_info = get_upgrade_recommendation(capacity)
            recommended_capacity = upgrade_info['recommended']
            reason = f'High demand ({score:.0f}) in small bin ({capacity}L)'
            estimated_cost = COST_ESTIMATES['UPGRADE']
            expected_benefit = f'Reduce overflow by ~40%, capacity +{recommended_capacity - capacity}L'
        
        # 2. UPGRADE: Chronic overflow cluster
        elif cluster_label == 'high_risk_chronic_overflow' and overflow_rate > thresholds['overflow_rate']:
            action = 'UPGRADE'
            priority = 'HIGH'
            upgrade_info = get_upgrade_recommendation(capacity)
            recommended_capacity = upgrade_info['recommended']
            reason = f'Chronic overflow cluster, {overflow_rate*100:.0f}% overflow rate'
            estimated_cost = COST_ESTIMATES['UPGRADE']
            expected_benefit = f'Reduce overflow by ~50%, capacity +{recommended_capacity - capacity}L'
        
        # 3. ADD_BIN: High score with decent capacity but still overflowing
        elif score >= thresholds['add_bin_score'] and overflow_rate > thresholds['overflow_rate']:
            action = 'ADD_BIN_NEARBY'
            priority = 'HIGH' if score >= 85 else 'MEDIUM'
            reason = f'High demand ({score:.0f}) with {overflow_rate*100:.0f}% overflow rate'
            estimated_cost = COST_ESTIMATES['ADD_BIN_NEARBY']
            expected_benefit = f'Reduce overflow by ~60%, serve excess waste'
        
        # 4. ADD_BIN: Festival-sensitive area
        elif festival_sensitivity > 2.0 and score >= 60:
            action = 'ADD_BIN_NEARBY'
            priority = 'MEDIUM'
            reason = f'High festival sensitivity ({festival_sensitivity:.1f}x), demand score {score:.0f}'
            estimated_cost = COST_ESTIMATES['ADD_BIN_NEARBY']
            expected_benefit = 'Handle festival waste spikes, reduce overflow by ~50%'
        
        # 5. RELOCATE: Very low score but large bin
        elif score < thresholds['relocate_score'] and capacity > thresholds['capacity_large']:
            action = 'RELOCATE'
            priority = 'LOW'
            reason = f'Low demand ({score:.0f}) in large bin ({capacity}L)'
            estimated_cost = COST_ESTIMATES['RELOCATE']
            expected_benefit = f'Better resource utilization, savings on maintenance'
        
        # 6. REMOVE: Very low score, small bin
        elif score < thresholds['remove_score']:
            action = 'REMOVE'
            priority = 'LOW'
            reason = f'Consistently low demand ({score:.0f})'
            estimated_cost = COST_ESTIMATES['REMOVE']
            expected_benefit = f'Annual savings ~₹{200 + capacity*0.1:.0f}'
        
        # 7. KEEP: Everything else
        else:
            action = 'KEEP'
            priority = 'LOW'
            reason = 'Bin performing adequately'
            estimated_cost = 0
            expected_benefit = 'No change needed'
        
        # Calculate ROI for actionable recommendations
        if action != 'KEEP':
            # Estimate annual cost savings (rough approximation)
            current_annual_cost = 500 + (capacity * 0.1)  # ₹500 base + ₹0.1 per liter
            new_annual_cost = current_annual_cost * 0.7 if action == 'UPGRADE' else current_annual_cost
            overflow_reduction = 0.4 if action in ['UPGRADE', 'ADD_BIN_NEARBY'] else 0.0
            roi = calculate_roi(current_annual_cost, new_annual_cost, overflow_reduction)
        else:
            roi = 0
        
        recommendations.append({
            'bin_id': bin_id,
            'action': action,
            'priority': priority,
            'reason': reason,
            'current_capacity': capacity,
            'recommended_capacity': recommended_capacity,
            'capacity_change': recommended_capacity - capacity,
            'estimated_cost': estimated_cost,
            'expected_benefit': expected_benefit,
            'roi_percent': round(roi, 1),
            'demand_score': score,
            'risk_level': risk_level,
            'zone_type': zone_type,
            'cluster_label': cluster_label,
            'overflow_rate': round(overflow_rate, 3),
            'festival_sensitivity': round(festival_sensitivity, 2),
        })
    
    # ─── Convert to DataFrame and Sort ──────────────────────────────────────
    recommendations_df = pd.DataFrame(recommendations)
    
    # Sort by priority (HIGH first, then MEDIUM, then LOW)
    priority_order = {'HIGH': 0, 'MEDIUM': 1, 'LOW': 2}
    recommendations_df['priority_order'] = recommendations_df['priority'].map(priority_order)
    recommendations_df = recommendations_df.sort_values(
        ['priority_order', 'demand_score'], 
        ascending=[True, False]
    ).drop('priority_order', axis=1)
    
    # Apply max recommendations limit
    if max_recommendations and len(recommendations_df) > max_recommendations:
        recommendations_df = recommendations_df.head(max_recommendations)
    
    return recommendations_df.reset_index(drop=True)


# ─── Summary Functions ─────────────────────────────────────────────────────

def summarize_recommendations(recommendations_df: pd.DataFrame) -> Dict:
    """
    Generate summary statistics for recommendations.
    """
    if len(recommendations_df) == 0:
        return {
            'total_bins': 0,
            'actions': {},
            'high_priority': 0,
            'total_cost': 0,
            'avg_roi': 0,
            'summary_by_zone': {}
        }
    
    action_counts = recommendations_df['action'].value_counts().to_dict()
    
    # Cost summary
    cost_by_action = recommendations_df.groupby('action')['estimated_cost'].sum().to_dict()
    total_cost = recommendations_df['estimated_cost'].sum()
    avg_roi = recommendations_df[recommendations_df['roi_percent'] > 0]['roi_percent'].mean()
    
    # Zone summary
    zone_summary = recommendations_df.groupby('zone_type').agg({
        'bin_id': 'count',
        'estimated_cost': 'sum'
    }).rename(columns={'bin_id': 'count', 'estimated_cost': 'total_cost'}).to_dict()
    
    return {
        'total_bins': len(recommendations_df),
        'actions': action_counts,
        'high_priority': len(recommendations_df[recommendations_df['priority'] == 'HIGH']),
        'total_cost': total_cost,
        'avg_roi': round(avg_roi, 1) if not pd.isna(avg_roi) else 0,
        'cost_by_action': cost_by_action,
        'summary_by_zone': zone_summary
    }


def estimate_implementation_cost(recommendations_df: pd.DataFrame) -> float:
    """Calculate total implementation cost."""
    return recommendations_df['estimated_cost'].sum()


def get_high_priority_recommendations(recommendations_df: pd.DataFrame) -> pd.DataFrame:
    """Filter only HIGH priority recommendations."""
    return recommendations_df[recommendations_df['priority'] == 'HIGH']


def export_recommendations(
    recommendations_df: pd.DataFrame, 
    summary: Dict,
    filename: str = 'bin_recommendations_report.json'
):
    """
    Export recommendations to JSON format for dashboard/reporting.
    """
    report = {
        'generated_date': datetime.now().isoformat(),
        'summary': summary,
        'recommendations': recommendations_df.to_dict('records')
    }
    
    with open(filename, 'w') as f:
        json.dump(report, f, indent=2, default=str)
    
    print(f"✅ Exported report to {filename}")
    return report


# ─── Visualization ─────────────────────────────────────────────────────────

def visualize_recommendations(recommendations_df: pd.DataFrame, save_path: str = 'recommendations_analysis.png'):
    """
    Create visualizations for bin recommendations.
    """
    try:
        import matplotlib.pyplot as plt
        import seaborn as sns
        
        fig, axes = plt.subplots(2, 2, figsize=(14, 10))
        
        # 1. Action Distribution
        action_counts = recommendations_df['action'].value_counts()
        colors = {'UPGRADE': '#FF6B6B', 'ADD_BIN_NEARBY': '#FFA94D', 
                  'RELOCATE': '#FFD93D', 'REMOVE': '#6BCB77', 'KEEP': '#4D96FF'}
        action_colors = [colors.get(a, '#CCCCCC') for a in action_counts.index]
        axes[0, 0].bar(action_counts.index, action_counts.values, color=action_colors)
        axes[0, 0].set_title('Recommendation Distribution')
        axes[0, 0].set_xlabel('Action Type')
        axes[0, 0].set_ylabel('Number of Bins')
        
        # 2. Cost Breakdown
        cost_by_action = recommendations_df.groupby('action')['estimated_cost'].sum()
        cost_by_action = cost_by_action[cost_by_action > 0]
        axes[0, 1].pie(cost_by_action.values, labels=cost_by_action.index, autopct='%1.1f%%')
        axes[0, 1].set_title(f'Cost Breakdown (Total: ₹{cost_by_action.sum():,.0f})')
        
        # 3. Score vs Capacity
        actionable = recommendations_df[recommendations_df['action'] != 'KEEP']
        axes[1, 0].scatter(actionable['demand_score'], actionable['current_capacity'], 
                          c=actionable['priority'].map({'HIGH': 'red', 'MEDIUM': 'orange', 'LOW': 'blue'}), 
                          s=50, alpha=0.6)
        axes[1, 0].set_xlabel('Demand Score')
        axes[1, 0].set_ylabel('Current Capacity (L)')
        axes[1, 0].set_title('Score vs Capacity (Actionable Bins)')
        
        # 4. ROI by Action
        roi_data = recommendations_df[recommendations_df['roi_percent'] > 0]
        if len(roi_data) > 0:
            sns.boxplot(data=roi_data, x='action', y='roi_percent', ax=axes[1, 1])
            axes[1, 1].set_title('ROI by Action Type')
            axes[1, 1].set_xlabel('Action Type')
            axes[1, 1].set_ylabel('ROI (%)')
        
        plt.tight_layout()
        plt.savefig(save_path, dpi=150, bbox_inches='tight')
        plt.close()
        print(f"📊 Visualizations saved to {save_path}")
        
    except ImportError:
        print("⚠️ matplotlib/seaborn not installed. Skipping visualization.")
    except Exception as e:
        print(f"⚠️ Error creating visualizations: {e}")
