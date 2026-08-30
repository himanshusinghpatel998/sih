"""
Optimization module for Smart Waste Management.
Handles: Demand Scores → Bin Recommendations → Route Optimization
"""

from .demand_score import (
    BinDemandScoreCalculator,
    calculate_all_demand_scores,
    get_bins_for_collection,
    generate_summary_report,
    run_demand_score_pipeline,
    visualize_demand_scores,
    load_bin_data,
    load_latest_predictions,
    create_sample_predictions,
)

from .bin_recommendations import (
    generate_bin_recommendations,
    summarize_recommendations,
    estimate_implementation_cost,
)

from .route_optimizer import (
    RouteOptimizer,
    visualize_routes,
)

from .worker_assignment import (
    WorkerAssigner,
)

from .dynamic_rerouting import (
    DynamicRerouter,
)

__all__ = [
    # Demand Score
    'BinDemandScoreCalculator',
    'calculate_all_demand_scores',
    'get_bins_for_collection',
    'generate_summary_report',
    'run_demand_score_pipeline',
    'visualize_demand_scores',
    'load_bin_data',
    'load_latest_predictions',
    'create_sample_predictions',
    
    # Bin Recommendations
    'generate_bin_recommendations',
    'summarize_recommendations',
    'estimate_implementation_cost',
    
    # Route Optimization
    'RouteOptimizer',
    'visualize_routes',
    
    # Worker Assignment
    'WorkerAssigner',
    
    # Dynamic Rerouting
    'DynamicRerouter',
]
