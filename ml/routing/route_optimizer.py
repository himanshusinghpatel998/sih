"""
route_optimizer.py - Phase 3: Route Optimization with OR-Tools
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Tuple, Optional
from datetime import datetime, timedelta
import json
import warnings
warnings.filterwarnings('ignore')

# Try importing OR-Tools
try:
    from ortools.constraint_solver import routing_enums_pb2
    from ortools.constraint_solver import pywrapcp
    OR_TOOLS_AVAILABLE = True
except ImportError:
    OR_TOOLS_AVAILABLE = False
    print("⚠️ OR-Tools not installed. Install with: pip install ortools")

# ─── Constants ──────────────────────────────────────────────────────────────

DEFAULT_FLEET = [
    {'vehicle_id': 'T1', 'capacity_kg': 800, 'type': 'standard'},
    {'vehicle_id': 'T2', 'capacity_kg': 800, 'type': 'standard'},
    {'vehicle_id': 'T3', 'capacity_kg': 600, 'type': 'compact'},
    {'vehicle_id': 'T4', 'capacity_kg': 600, 'type': 'compact'},
]

SERVICE_TIME_MINUTES = {
    'CRITICAL': 15,
    'HIGH': 12,
    'MEDIUM': 10,
    'LOW': 8,
    'VERY_LOW': 5
}

AVERAGE_SPEED_KMPH = 25
START_TIME = datetime.strptime('08:00', '%H:%M')

# ─── Helper Functions ──────────────────────────────────────────────────────

def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    from math import radians, sin, cos, sqrt, atan2
    R = 6371000
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))
    return R * c

def create_distance_matrix(locations: List[Tuple[float, float]]) -> List[List[float]]:
    n = len(locations)
    matrix = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i != j:
                matrix[i][j] = calculate_distance(
                    locations[i][0], locations[i][1],
                    locations[j][0], locations[j][1]
                )
    return matrix

def format_time(minutes_from_start: float) -> str:
    start = START_TIME
    total_minutes = int(minutes_from_start)
    dt = start + timedelta(minutes=total_minutes)
    return dt.strftime('%H:%M')

# ─── RouteOptimizer Class ──────────────────────────────────────────────────

class RouteOptimizer:
    def __init__(self, bins_df: pd.DataFrame, scores_df: pd.DataFrame, fleet_data: List[Dict] = None):
        self.bins_df = bins_df.copy()
        self.scores_df = scores_df.copy()
        self.fleet_data = fleet_data or DEFAULT_FLEET
        self._merge_data()
        self.bins_to_collect = self._get_bins_to_collect()
        
        if not OR_TOOLS_AVAILABLE:
            print("⚠️ OR-Tools not available. Using fallback routing.")

    def _merge_data(self):
        if 'total_score' not in self.scores_df.columns:
            raise ValueError("scores_df must contain 'total_score' column")
        self.merged_df = self.bins_df.merge(
            self.scores_df[['bin_id', 'total_score', 'risk_level', 'route_priority']],
            on='bin_id', how='inner'
        )
        self.merged_df['location'] = list(zip(self.merged_df['latitude'], self.merged_df['longitude']))

    def _get_bins_to_collect(self) -> pd.DataFrame:
        """Filter bins that need collection today (score >= 15)."""
        return self.merged_df[self.merged_df['total_score'] >= 15].copy()

    def _create_data_model(self) -> Dict:
        bins = self.bins_to_collect
        if len(bins) == 0:
            return None
        
        bins = bins.sort_values('total_score', ascending=False)
        depot_location = (bins.iloc[0]['latitude'], bins.iloc[0]['longitude'])
        locations = [depot_location] + [(row['latitude'], row['longitude']) for _, row in bins.iterrows()]
        
        demands = [0]
        for _, row in bins.iterrows():
            capacity = row.get('bin_capacity_liters', 500)
            fill_pct = row.get('avg_fill_pct', 50) / 100
            waste_kg = capacity * fill_pct * 0.5
            demands.append(waste_kg)
        
        vehicle_capacities = [v['capacity_kg'] for v in self.fleet_data]
        distance_matrix = create_distance_matrix(locations)
        
        return {
            'locations': locations,
            'demands': demands,
            'vehicle_capacities': vehicle_capacities,
            'distance_matrix': distance_matrix,
            'num_vehicles': len(self.fleet_data),
            'depot': 0,
            'bins': bins.reset_index(drop=True),
        }

    def optimize_routes(self) -> Dict:
        print("\n" + "=" * 60)
        print("🛻 ROUTE OPTIMIZATION")
        print("=" * 60)
        
        if len(self.bins_to_collect) == 0:
            print("⚠️ No bins to collect today (score >= 15)")
            return {'routes': [], 'total_routes': 0, 'total_bins': 0}
        
        print(f"📊 Optimizing routes for {len(self.bins_to_collect)} bins")
        print(f"🚛 Using {len(self.fleet_data)} trucks")
        
        if OR_TOOLS_AVAILABLE:
            result = self._solve_with_ortools()
        else:
            result = self._solve_fallback()
        
        if result is None:
            return {'routes': [], 'total_routes': 0, 'total_bins': 0}
        
        print(f"\n📈 ROUTING RESULTS:")
        print("-" * 60)
        print(f"   Total Routes:     {result['total_routes']}")
        print(f"   Total Bins:       {result['total_bins']}")
        print(f"   Total Distance:   {result['total_distance_km']} km")
        print(f"   Avg Utilization:  {result['average_utilization']}%")
        print(f"   Est. Hours:       {result['estimated_hours']:.1f}h")
        
        return result

    def _solve_with_ortools(self) -> Dict:
        data = self._create_data_model()
        if data is None:
            return None
        
        manager = pywrapcp.RoutingIndexManager(
            len(data['distance_matrix']),
            data['num_vehicles'],
            data['depot']
        )
        routing = pywrapcp.RoutingModel(manager)
        
        def distance_callback(from_index, to_index):
            from_node = manager.IndexToNode(from_index)
            to_node = manager.IndexToNode(to_index)
            return int(data['distance_matrix'][from_node][to_node])
        
        transit_callback_index = routing.RegisterTransitCallback(distance_callback)
        routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)
        
        def demand_callback(from_index):
            from_node = manager.IndexToNode(from_index)
            return int(data['demands'][from_node])
        
        demand_callback_index = routing.RegisterUnaryTransitCallback(demand_callback)
        routing.AddDimensionWithVehicleCapacity(
            demand_callback_index,
            0,
            data['vehicle_capacities'],
            True,
            'Capacity'
        )
        
        search_parameters = pywrapcp.DefaultRoutingSearchParameters()
        search_parameters.first_solution_strategy = (
            routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
        )
        search_parameters.time_limit.seconds = 30
        
        solution = routing.SolveWithParameters(search_parameters)
        if solution:
            return self._extract_routes(solution, routing, manager, data)
        else:
            print("⚠️ OR-Tools found no solution. Using fallback.")
            return self._solve_fallback(data)

    def _extract_routes(self, solution, routing, manager, data) -> Dict:
        routes = []
        total_distance = 0
        total_bins = 0
        
        for vehicle_id in range(data['num_vehicles']):
            index = routing.Start(vehicle_id)
            route_bins = []
            route_distance = 0
            route_demand = 0
            current_time = 0
            
            while not routing.IsEnd(index):
                node_index = manager.IndexToNode(index)
                if node_index != data['depot']:
                    bin_row = data['bins'].iloc[node_index - 1]
                    service_time = SERVICE_TIME_MINUTES.get(
                        bin_row.get('risk_level', 'MEDIUM'), 10
                    )
                    route_bins.append({
                        'bin_id': bin_row['bin_id'],
                        'latitude': bin_row['latitude'],
                        'longitude': bin_row['longitude'],
                        'demand_score': bin_row['total_score'],
                        'risk_level': bin_row['risk_level'],
                        'estimated_arrival': format_time(current_time),
                        'service_time': service_time,
                        'capacity_used': data['demands'][node_index]
                    })
                    current_time += service_time
                
                previous_index = index
                index = solution.Value(routing.NextVar(index))
                if previous_index != index:
                    arc_distance = routing.GetArcCostForVehicle(previous_index, index, vehicle_id) / 1000
                    route_distance += arc_distance
                    travel_time = (arc_distance / AVERAGE_SPEED_KMPH) * 60
                    current_time += travel_time
            
            if route_bins:
                routes.append({
                    'vehicle_id': self.fleet_data[vehicle_id]['vehicle_id'],
                    'vehicle_type': self.fleet_data[vehicle_id].get('type', 'standard'),
                    'capacity_kg': data['vehicle_capacities'][vehicle_id],
                    'stops': route_bins,
                    'total_bins': len(route_bins),
                    'total_distance_km': round(route_distance, 2),
                    'total_demand_kg': round(route_demand, 2),
                    'utilization_pct': round((route_demand / data['vehicle_capacities'][vehicle_id]) * 100, 1)
                })
                total_distance += route_distance
                total_bins += len(route_bins)
        
        return {
            'routes': routes,
            'total_routes': len(routes),
            'total_bins': total_bins,
            'total_distance_km': round(total_distance, 2),
            'average_utilization': round(np.mean([r['utilization_pct'] for r in routes]) if routes else 0, 1),
            'estimated_hours': round((total_distance / AVERAGE_SPEED_KMPH) * 1.5, 2),
        }

    def _solve_fallback(self, data=None) -> Dict:
        if data is None:
            data = self._create_data_model()
            if data is None:
                return None
        
        bins = data['bins']
        locations = data['locations']
        demands = data['demands']
        capacities = data['vehicle_capacities']
        
        routes = []
        remaining_bins = list(range(1, len(locations)))
        
        for vehicle_id, capacity in enumerate(capacities):
            current_capacity = 0
            current_location = 0
            route_bins = []
            route_distance = 0
            
            while remaining_bins and current_capacity < capacity:
                nearest_idx = min(remaining_bins, key=lambda idx: data['distance_matrix'][current_location][idx])
                if current_capacity + demands[nearest_idx] > capacity:
                    remaining_bins.remove(nearest_idx)
                    continue
                
                bin_row = bins.iloc[nearest_idx - 1]
                route_bins.append({
                    'bin_id': bin_row['bin_id'],
                    'latitude': bin_row['latitude'],
                    'longitude': bin_row['longitude'],
                    'demand_score': bin_row['total_score'],
                    'risk_level': bin_row['risk_level'],
                    'estimated_arrival': format_time(len(route_bins) * 20),
                    'service_time': SERVICE_TIME_MINUTES.get(bin_row.get('risk_level', 'MEDIUM'), 10),
                    'capacity_used': demands[nearest_idx]
                })
                route_distance += data['distance_matrix'][current_location][nearest_idx] / 1000
                current_capacity += demands[nearest_idx]
                current_location = nearest_idx
                remaining_bins.remove(nearest_idx)
            
            if route_bins:
                routes.append({
                    'vehicle_id': self.fleet_data[vehicle_id]['vehicle_id'],
                    'vehicle_type': self.fleet_data[vehicle_id].get('type', 'standard'),
                    'capacity_kg': capacity,
                    'stops': route_bins,
                    'total_bins': len(route_bins),
                    'total_distance_km': round(route_distance, 2),
                    'total_demand_kg': round(current_capacity, 2),
                    'utilization_pct': round((current_capacity / capacity) * 100, 1)
                })
        
        return {
            'routes': routes,
            'total_routes': len(routes),
            'total_bins': sum(r['total_bins'] for r in routes),
            'total_distance_km': round(sum(r['total_distance_km'] for r in routes), 2),
            'average_utilization': round(np.mean([r['utilization_pct'] for r in routes]) if routes else 0, 1),
            'estimated_hours': round((sum(r['total_distance_km'] for r in routes) / AVERAGE_SPEED_KMPH) * 1.5, 2),
        }

    def export_routes(self, routes: Dict, filename: str = 'routes_output.json'):
        if routes is None or not routes.get('routes'):
            print("⚠️ No routes to export")
            return
        
        output = {
            'generated_at': datetime.now().isoformat(),
            'summary': {
                'total_routes': routes['total_routes'],
                'total_bins': routes['total_bins'],
                'total_distance_km': routes['total_distance_km'],
                'average_utilization': routes['average_utilization'],
                'estimated_hours': routes['estimated_hours']
            },
            'routes': []
        }
        
        for route in routes['routes']:
            output['routes'].append({
                'vehicle_id': route['vehicle_id'],
                'vehicle_type': route['vehicle_type'],
                'capacity_kg': route['capacity_kg'],
                'total_bins': route['total_bins'],
                'total_distance_km': route['total_distance_km'],
                'utilization_pct': route['utilization_pct'],
                'stops': [{
                    'bin_id': stop['bin_id'],
                    'latitude': stop['latitude'],
                    'longitude': stop['longitude'],
                    'risk_level': stop['risk_level'],
                    'estimated_arrival': stop['estimated_arrival'],
                    'service_time': stop['service_time'],
                    'demand_score': stop['demand_score']
                } for stop in route['stops']]
            })
        
        with open(filename, 'w') as f:
            json.dump(output, f, indent=2)
        print(f"✅ Exported routes to {filename}")

def visualize_routes(routes_result: Dict, save_path: str = 'routes_map.html'):
    try:
        import folium
        from folium import plugins
        
        if not routes_result or not routes_result.get('routes'):
            print("⚠️ No routes to visualize")
            return
        
        all_lats = []
        all_lons = []
        for route in routes_result['routes']:
            for stop in route['stops']:
                all_lats.append(stop['latitude'])
                all_lons.append(stop['longitude'])
        
        if not all_lats:
            print("⚠️ No stops to visualize")
            return
        
        center_lat = sum(all_lats) / len(all_lats)
        center_lon = sum(all_lons) / len(all_lons)
        
        m = folium.Map(location=[center_lat, center_lon], zoom_start=14)
        
        colors = {'CRITICAL': 'red', 'HIGH': 'orange', 'MEDIUM': 'yellow', 'LOW': 'green', 'VERY_LOW': 'gray'}
        
        for route in routes_result['routes']:
            coords = [[stop['latitude'], stop['longitude']] for stop in route['stops']]
            if len(coords) > 1:
                folium.PolyLine(coords, color='blue', weight=3, opacity=0.7, popup=f"Route {route['vehicle_id']}").add_to(m)
            
            for stop in route['stops']:
                color = colors.get(stop['risk_level'], 'gray')
                folium.CircleMarker(
                    location=[stop['latitude'], stop['longitude']],
                    radius=10 if stop['risk_level'] in ['CRITICAL', 'HIGH'] else 6,
                    color=color,
                    fill=True,
                    fill_color=color,
                    fill_opacity=0.7,
                    popup=f"<b>{stop['bin_id']}</b><br>Score: {stop['demand_score']}<br>Risk: {stop['risk_level']}<br>Arrival: {stop['estimated_arrival']}<br>Vehicle: {route['vehicle_id']}"
                ).add_to(m)
        
        m.save(save_path)
        print(f"🗺️  Interactive map saved to {save_path}")
    except ImportError:
        print("⚠️ folium not installed. Install with: pip install folium")
