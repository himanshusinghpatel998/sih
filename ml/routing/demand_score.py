"""
demand_score.py - Simplified version that handles missing data gracefully
"""

import pandas as pd
import numpy as np
import json
from datetime import datetime
from typing import Dict, List, Tuple, Optional
import warnings
warnings.filterwarnings('ignore')

# ─── Constants ──────────────────────────────────────────────────────────────

ZONE_WEIGHTS = {
    'tourist': 10.0,
    'market': 9.0,
    'commercial': 7.5,
    'institutional': 6.5,
    'residential_high': 6.0,
    'mixed_use': 5.5,
    'residential_low': 4.5,
    'industrial': 3.5,
}

CLUSTER_RISK_WEIGHTS = {
    'high_risk_chronic_overflow': 10.0,
    'event_spiky': 8.0,
    'high_volume_steady': 7.0,
    'low_volume_stable': 3.0,
}

# ─── Helper Functions ──────────────────────────────────────────────────────

def get_zone_weight(zone_type: str) -> float:
    return ZONE_WEIGHTS.get(zone_type, 5.0)

def get_cluster_risk_weight(cluster_label: str) -> float:
    return CLUSTER_RISK_WEIGHTS.get(cluster_label, 5.0)


def load_bin_data(bins_path: str = 'bins_master.csv', 
                  clusters_path: str = 'bin_cluster_mapping.csv') -> pd.DataFrame:
    bins = pd.read_csv(bins_path)
    print(f"   ✅ Loaded {len(bins)} bins from {bins_path}")
    
    try:
        clusters = pd.read_csv(clusters_path)
        print(f"   ✅ Loaded cluster mapping for {len(clusters)} bins from {clusters_path}")
    except FileNotFoundError:
        print(f"   ⚠️ Cluster mapping not found. Creating defaults.")
        clusters = pd.DataFrame({'bin_id': bins['bin_id']})
    
    df = bins.merge(clusters, on='bin_id', how='left')
    
    # Fill missing columns with defaults
    for col in ['bin_cluster_id', 'cluster_label']:
        if col not in df.columns:
            df[col] = 'low_volume_stable'
    
    for col in ['overflow_rate', 'avg_fill_pct', 'festival_sensitivity', 
                'weekend_sensitivity', 'avg_days_between_collections']:
        if col not in df.columns:
            df[col] = 0.0 if 'rate' in col else 50.0 if 'fill' in col else 1.0
    
    return df


def create_sample_predictions(bins: pd.DataFrame, seed: int = 42) -> pd.DataFrame:
    np.random.seed(seed)
    predictions = pd.DataFrame({
        'bin_id': bins['bin_id'],
        'predicted_fill_pct': np.random.uniform(30, 95, len(bins)),
        'overflow_risk': np.random.uniform(0, 0.95, len(bins)),
        'prediction_date': datetime.now().date()
    })
    return predictions


def load_latest_predictions(predictions_path: str = 'predictions_latest.csv', 
                           bins: Optional[pd.DataFrame] = None) -> pd.DataFrame:
    try:
        predictions = pd.read_csv(predictions_path)
        print(f"   ✅ Loaded predictions for {len(predictions)} bins from {predictions_path}")
        return predictions
    except FileNotFoundError:
        if bins is not None:
            print(f"   ⚠️ Predictions file not found. Creating sample predictions...")
            predictions = create_sample_predictions(bins)
            predictions.to_csv(predictions_path, index=False)
            print(f"   ✅ Saved sample predictions to {predictions_path}")
            return predictions
        else:
            raise FileNotFoundError(f"Predictions file {predictions_path} not found")


# ─── Demand Score Calculator ─────────────────────────────────────────────

class BinDemandScoreCalculator:
    def __init__(self):
        self.zone_weights = ZONE_WEIGHTS
        self.cluster_weights = CLUSTER_RISK_WEIGHTS
    
    def calculate_single_bin(self, bin_data: Dict) -> Dict:
        bin_id = bin_data.get('bin_id', 'UNKNOWN')
        zone_type = bin_data.get('zone_type', 'residential_low')
        bin_capacity = bin_data.get('bin_capacity_liters', 500)
        cluster_label = bin_data.get('cluster_label', 'low_volume_stable')
        
        predicted_fill = bin_data.get('predicted_fill_pct', 50)
        overflow_risk = bin_data.get('overflow_risk', 0.1)
        current_fill = bin_data.get('current_fill_pct', bin_data.get('avg_fill_pct', 50))
        days_since_collection = bin_data.get('days_since_last_collection', 
                                            bin_data.get('avg_days_between_collections', 1))
        overflow_rate = bin_data.get('overflow_rate', 0.0)
        festival_sensitivity = bin_data.get('festival_sensitivity', 1.0)
        
        # ─── Urgency Score (0-50) ────────────────────────────────────────────
        urgency_score = 0
        if overflow_risk > 0.9:
            urgency_score += 30
        elif overflow_risk > 0.8:
            urgency_score += 25
        elif overflow_risk > 0.7:
            urgency_score += 20
        elif overflow_risk > 0.5:
            urgency_score += 15
        elif overflow_risk > 0.3:
            urgency_score += 10
        else:
            urgency_score += overflow_risk * 30
        
        if current_fill > 90:
            urgency_score += 10
        elif current_fill > 80:
            urgency_score += 7
        elif current_fill > 70:
            urgency_score += 4
        elif current_fill > 60:
            urgency_score += 2
        
        if days_since_collection > 5:
            urgency_score += 10
        elif days_since_collection > 3:
            urgency_score += 7
        elif days_since_collection > 2:
            urgency_score += 4
        elif days_since_collection > 1:
            urgency_score += 2
        
        urgency_score = min(50, urgency_score)
        
        # ─── Strategic Score (0-30) ──────────────────────────────────────────
        strategic_score = 0
        if overflow_rate > 0.3:
            strategic_score += 10
        elif overflow_rate > 0.2:
            strategic_score += 7
        elif overflow_rate > 0.1:
            strategic_score += 4
        else:
            strategic_score += overflow_rate * 10
        
        if festival_sensitivity > 2.0:
            strategic_score += 8
        elif festival_sensitivity > 1.5:
            strategic_score += 6
        elif festival_sensitivity > 1.2:
            strategic_score += 4
        elif festival_sensitivity > 1.0:
            strategic_score += 2
        
        strategic_score += self.zone_weights.get(zone_type, 5.0) * 0.7
        strategic_score += self.cluster_weights.get(cluster_label, 5.0) * 0.5
        strategic_score = min(30, strategic_score)
        
        # ─── Capacity Score (0-20) ────────────────────────────────────────────
        capacity_score = 0
        utilization_ratio = (current_fill / 100) * bin_capacity
        
        if bin_capacity < 300:
            if utilization_ratio > 200: capacity_score += 10
            elif utilization_ratio > 150: capacity_score += 7
        elif bin_capacity < 600:
            if utilization_ratio > 400: capacity_score += 10
            elif utilization_ratio > 300: capacity_score += 7
        else:
            if utilization_ratio > 800: capacity_score += 10
            elif utilization_ratio > 600: capacity_score += 7
        
        if predicted_fill > 90: capacity_score += 5
        elif predicted_fill > 80: capacity_score += 3
        elif predicted_fill > 70: capacity_score += 1
        
        capacity_score = min(20, capacity_score)
        
        total_score = urgency_score + strategic_score + capacity_score
        final_score = min(100, total_score)
        
        if final_score >= 80:
            risk_level = 'CRITICAL'
            recommendation = 'COLLECT IMMEDIATELY - High overflow risk'
        elif final_score >= 60:
            risk_level = 'HIGH'
            recommendation = 'COLLECT TODAY - Monitor closely'
        elif final_score >= 40:
            risk_level = 'MEDIUM'
            recommendation = 'COLLECT AS SCHEDULED - Routine monitoring'
        elif final_score >= 20:
            risk_level = 'LOW'
            recommendation = 'MONITOR - Low urgency'
        else:
            risk_level = 'VERY_LOW'
            recommendation = 'ROUTINE - No immediate action needed'
        
        route_priority = 1 if final_score >= 80 else 2 if final_score >= 60 else 3 if final_score >= 40 else 4 if final_score >= 20 else 5
        
        return {
            'bin_id': bin_id,
            'total_score': round(final_score, 1),
            'urgency_score': round(urgency_score, 1),
            'strategic_score': round(strategic_score, 1),
            'capacity_score': round(capacity_score, 1),
            'risk_level': risk_level,
            'recommendation': recommendation,
            'route_priority': route_priority,
            'zone_type': zone_type,
            'bin_capacity_liters': bin_capacity,
        }


# ─── Batch Processing ─────────────────────────────────────────────────────

def calculate_all_demand_scores(df: pd.DataFrame) -> pd.DataFrame:
    calculator = BinDemandScoreCalculator()
    results = []
    for idx, row in df.iterrows():
        result = calculator.calculate_single_bin(row.to_dict())
        results.append(result)
    scores_df = pd.DataFrame(results)
    scores_df = scores_df.sort_values('total_score', ascending=False).reset_index(drop=True)
    scores_df['rank'] = scores_df.index + 1
    return scores_df


def get_bins_for_collection(scores_df: pd.DataFrame, max_bins: Optional[int] = None, threshold: float = 40) -> pd.DataFrame:
    bins_to_collect = scores_df[scores_df['total_score'] >= threshold].copy()
    bins_to_collect = bins_to_collect.sort_values('total_score', ascending=False)
    if max_bins and len(bins_to_collect) > max_bins:
        bins_to_collect = bins_to_collect.head(max_bins)
    return bins_to_collect


def generate_summary_report(scores_df: pd.DataFrame) -> Dict:
    return {
        'total_bins': len(scores_df),
        'critical_bins': len(scores_df[scores_df['risk_level'] == 'CRITICAL']),
        'high_risk_bins': len(scores_df[scores_df['risk_level'] == 'HIGH']),
        'medium_risk_bins': len(scores_df[scores_df['risk_level'] == 'MEDIUM']),
        'low_risk_bins': len(scores_df[scores_df['risk_level'] == 'LOW']),
        'very_low_bins': len(scores_df[scores_df['risk_level'] == 'VERY_LOW']),
        'avg_score': scores_df['total_score'].mean(),
        'max_score': scores_df['total_score'].max(),
        'min_score': scores_df['total_score'].min(),
        'bins_above_70': len(scores_df[scores_df['total_score'] >= 70]),
        'bins_above_50': len(scores_df[scores_df['total_score'] >= 50]),
        'bins_above_40': len(scores_df[scores_df['total_score'] >= 40]),
    }


def visualize_demand_scores(scores_df: pd.DataFrame, save_path: str = 'demand_score_analysis.png'):
    try:
        import matplotlib.pyplot as plt
        import seaborn as sns
        fig, axes = plt.subplots(2, 2, figsize=(14, 10))
        axes[0, 0].hist(scores_df['total_score'], bins=20, color='steelblue', edgecolor='black', alpha=0.7)
        axes[0, 0].axvline(80, color='red', linestyle='--', label='Critical (80)')
        axes[0, 0].axvline(60, color='orange', linestyle='--', label='High (60)')
        axes[0, 0].axvline(40, color='gold', linestyle='--', label='Medium (40)')
        axes[0, 0].set_title('Demand Score Distribution')
        axes[0, 0].legend()
        risk_counts = scores_df['risk_level'].value_counts()
        axes[0, 1].pie(risk_counts.values, labels=risk_counts.index, autopct='%1.1f%%', 
                       colors=['#FF0000', '#FF6600', '#FFCC00', '#33CC33', '#CCCCCC'])
        axes[0, 1].set_title('Risk Level Distribution')
        plt.tight_layout()
        plt.savefig(save_path, dpi=150, bbox_inches='tight')
        plt.close()
        print(f"   📊 Visualizations saved to {save_path}")
    except Exception as e:
        print(f"   ⚠️ Could not create visualizations: {e}")


def run_demand_score_pipeline(
    bins_path: str = 'bins_master.csv',
    clusters_path: str = 'bin_cluster_mapping.csv',
    predictions_path: str = 'predictions_latest.csv',
    output_scores_path: str = 'bin_demand_scores.csv',
    output_collect_path: str = 'bins_to_collect_today.csv'
) -> Tuple[pd.DataFrame, pd.DataFrame, Dict]:
    print("\n📂 Loading data...")
    df = load_bin_data(bins_path, clusters_path)
    predictions = load_latest_predictions(predictions_path, df)
    df = df.merge(predictions, on='bin_id', how='left')
    
    # Fill missing values
    df['predicted_fill_pct'] = df['predicted_fill_pct'].fillna(50)
    df['overflow_risk'] = df['overflow_risk'].fillna(0.1)
    df['current_fill_pct'] = df.get('avg_fill_pct', 50).fillna(50)
    df['days_since_last_collection'] = df.get('avg_days_between_collections', 2).fillna(2)
    df['overflow_rate'] = df.get('overflow_rate', 0.0).fillna(0.0)
    df['festival_sensitivity'] = df.get('festival_sensitivity', 1.0).fillna(1.0)
    
    print(f"\n✅ Data loaded: {len(df)} bins")
    print("\n📊 Calculating demand scores...")
    scores_df = calculate_all_demand_scores(df)
    print(f"   ✅ Calculated scores for {len(scores_df)} bins")
    
    summary = generate_summary_report(scores_df)
    print("\n📈 SUMMARY REPORT:")
    print(f"   Total Bins:              {summary['total_bins']}")
    print(f"   CRITICAL (80-100):       {summary['critical_bins']}")
    print(f"   HIGH (60-79):            {summary['high_risk_bins']}")
    print(f"   MEDIUM (40-59):          {summary['medium_risk_bins']}")
    print(f"   LOW (20-39):             {summary['low_risk_bins']}")
    print(f"   VERY LOW (0-19):         {summary['very_low_bins']}")
    print(f"   Average Score:           {summary['avg_score']:.1f}")
    print(f"   Max Score:               {summary['max_score']:.1f}")
    
    print("\n🔴 TOP 10 HIGHEST RISK BINS:")
    print("-" * 60)
    for _, row in scores_df.head(10).iterrows():
        print(f"   {row['rank']:2d}. {row['bin_id']:8s} | Score: {row['total_score']:5.1f} | {row['risk_level']:8s} | Priority: {row['route_priority']}")
    
    bins_to_collect = get_bins_for_collection(scores_df, threshold=40)
    print(f"\n🗑️ {len(bins_to_collect)} bins need collection (score >= 40)")
    
    print("\n💾 Saving results...")
    scores_df.to_csv(output_scores_path, index=False)
    print(f"   ✅ Saved to {output_scores_path}")
    bins_to_collect.to_csv(output_collect_path, index=False)
    print(f"   ✅ Saved to {output_collect_path}")
    
    with open('demand_score_summary.json', 'w') as f:
        json.dump(summary, f, indent=2, default=str)
    print(f"   ✅ Saved summary to demand_score_summary.json")
    
    visualize_demand_scores(scores_df)
    
    print("\n" + "=" * 60)
    print("✅ DEMAND SCORE PIPELINE COMPLETE")
    print("=" * 60)
    
    return scores_df, bins_to_collect, summary
