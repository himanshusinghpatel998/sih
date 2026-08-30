"""
dynamic_rerouting.py - Phase 4: Dynamic Rerouting

This module handles real-time changes during route execution:
- New high-risk bins appearing mid-route
- Vehicle breakdowns
- Traffic delays
- Overflow alerts

Usage:
    from optimization.dynamic_rerouting import DynamicRerouter
    rerouter = DynamicRerouter(routes_result, bins_df)
    updated_routes = rerouter.handle_new_high_risk_bin(bin_id, current_routes)
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
import json
import warnings
warnings.filterwarnings('ignore')

# ─── Constants ──────────────────────────────────────────────────────────────

# Default insertion distance threshold (meters)
MAX_INSERTION_DISTANCE = 5000  # 5km

# Time thresholds for rerouting
TIME_THRESHOLDS = {
    'fast': 5,   # minutes - urgent reroute
    'medium': 15, # minutes - standard reroute
    'slow': 30   # minutes - planned reroute
}

# ─── Helper Functions ──────────────────────────────────────────────────────

def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate Haversine distance between two points in meters."""
    from math import radians, sin, cos, sqrt, atan2
    
    R = 6371000
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))
    
    return R * c

def find_nearest_bin(bin_id: str, current_location: Tuple[float, float], bins_df: pd.DataFrame) -> str:
    """Find the nearest bin to a given location."""
    distances = []
    for _, row in bins_df.iterrows():
        if row['bin_id'] == bin_id:
            continue
        dist = calculate_distance(
            current_location[0], current_location[1],
            row['latitude'], row['longitude']
        )
        distances.append((row['bin_id'], dist))
    
    distances.sort(key=lambda x: x[1])
    return distances[0][0] if distances else None

# ─── Dynamic Rerouter Class ─────────────────────────────────────────────────

class DynamicRerouter:
    """
    Handles real-time changes to routes during execution.
    """
    
    def __init__(
        self,
        routes_result: Dict,
        bins_df: pd.DataFrame,
        scores_df: Optional[pd.DataFrame] = None,
        config: Optional[Dict] = None
    ):
        """
        Initialize the dynamic rerouter.
        
        Args:
            routes_result: Original routes from Phase 3
            bins_df: Bin master data
            scores_df: Demand scores (for checking new high-risk bins)
            config: Configuration overrides
        """
        self.original_routes = routes_result
        self.current_routes = routes_result.copy() if routes_result else None
        self.bins_df = bins_df
        self.scores_df = scores_df
        self.config = config or {}
        
        # Create mapping for fast lookup
        self._build_mappings()
    
    def _build_mappings(self):
        """Build lookup mappings for bins and routes."""
        # Bin to location mapping
        self.bin_locations = {}
        for _, row in self.bins_df.iterrows():
            self.bin_locations[row['bin_id']] = (row['latitude'], row['longitude'])
        
        # Route mapping
        self.route_vehicle_mapping = {}
        if self.current_routes:
            for route in self.current_routes.get('routes', []):
                self.route_vehicle_mapping[route['vehicle_id']] = route
    
    def handle_new_high_risk_bin(
        self, 
        bin_id: str, 
        current_location: Optional[Tuple[float, float]] = None
    ) -> Dict:
        """
        Insert a new high-risk bin into the most appropriate route.
        
        Args:
            bin_id: ID of the newly high-risk bin
            current_location: Current location of the dispatcher/vehicle
        
        Returns:
            Dict with updated route information
        """
        if not self.current_routes:
            return {'error': 'No routes available'}
        
        # Get bin location
        if bin_id not in self.bin_locations:
            return {'error': f'Bin {bin_id} not found'}
        
        bin_location = self.bin_locations[bin_id]
        
        # Find the best route to insert into
        best_route_id = None
        best_insert_position = None
        min_distance_increase = float('inf')
        
        for route in self.current_routes.get('routes', []):
            stops = route.get('stops', [])
            
            if len(stops) < 2:
                continue
            
            # Try inserting at each position
            for i in range(1, len(stops)):
                # Calculate distance increase
                prev_stop = stops[i-1]
                current_stop = stops[i] if i < len(stops) else None
                
                prev_loc = self.bin_locations.get(prev_stop['bin_id'])
                if not prev_loc:
                    continue
                
                # Distance from prev to new bin
                dist_prev_to_new = calculate_distance(
                    prev_loc[0], prev_loc[1],
                    bin_location[0], bin_location[1]
                )
                
                # Distance from new bin to next
                if current_stop:
                    next_loc = self.bin_locations.get(current_stop['bin_id'])
                    if next_loc:
                        dist_new_to_next = calculate_distance(
                            bin_location[0], bin_location[1],
                            next_loc[0], next_loc[1]
                        )
                    else:
                        dist_new_to_next = 0
                else:
                    dist_new_to_next = 0
                
                # Original distance between prev and next
                if current_stop:
                    orig_dist = calculate_distance(
                        prev_loc[0], prev_loc[1],
                        next_loc[0], next_loc[1]
                    ) if next_loc else 0
                else:
                    orig_dist = 0
                
                # Distance increase
                distance_increase = dist_prev_to_new + dist_new_to_next - orig_dist
                
                if distance_increase < min_distance_increase:
                    min_distance_increase = distance_increase
                    best_route_id = route['vehicle_id']
                    best_insert_position = i
        
        # If no suitable route found, dispatch new vehicle
        if min_distance_increase > self.config.get('max_insertion_distance', MAX_INSERTION_DISTANCE):
            return {
                'action': 'DISPATCH_NEW_TRUCK',
                'bin_id': bin_id,
                'reason': f'Bin too far from existing routes ({min_distance_increase/1000:.1f}km away)',
                'estimated_arrival': '30 min'
            }
        
        # Insert the bin
        if best_route_id and best_insert_position is not None:
            # Find the route
            target_route = None
            for route in self.current_routes['routes']:
                if route['vehicle_id'] == best_route_id:
                    target_route = route
                    break
            
            if target_route:
                # Get bin details
                bin_row = self.bins_df[self.bins_df['bin_id'] == bin_id].iloc[0] if len(self.bins_df[self.bins_df['bin_id'] == bin_id]) > 0 else None
                score = self.scores_df[self.scores_df['bin_id'] == bin_id]['total_score'].iloc[0] if self.scores_df is not None and len(self.scores_df[self.scores_df['bin_id'] == bin_id]) > 0 else 50
                
                new_stop = {
                    'bin_id': bin_id,
                    'latitude': bin_location[0],
                    'longitude': bin_location[1],
                    'demand_score': score,
                    'risk_level': 'CRITICAL',
                    'estimated_arrival': self._estimate_arrival_time(
                        target_route, best_insert_position
                    ),
                    'service_time': 15,
                    'capacity_used': self._estimate_waste_kg(bin_row),
                    'inserted_dynamically': True,
                    'insertion_time': datetime.now().isoformat()
                }
                
                # Insert the stop
                target_route['stops'].insert(best_insert_position, new_stop)
                target_route['total_bins'] = len(target_route['stops'])
                
                # Update route metrics
                target_route['total_distance_km'] += min_distance_increase / 1000
                target_route['total_demand_kg'] += new_stop['capacity_used']
                target_route['utilization_pct'] = (target_route['total_demand_kg'] / target_route['capacity_kg']) * 100
                
                return {
                    'action': 'INSERTED_INTO_ROUTE',
                    'route_id': best_route_id,
                    'bin_id': bin_id,
                    'position': best_insert_position,
                    'distance_increase_km': min_distance_increase / 1000,
                    'updated_route': target_route,
                    'driver_notified': True,
                    'estimated_arrival': new_stop['estimated_arrival']
                }
        
        return {'error': 'Could not insert bin into any route'}
    
    def handle_vehicle_breakdown(self, vehicle_id: str) -> Dict:
        """
        Handle a vehicle breakdown by redistributing its stops to other vehicles.
        
        Args:
            vehicle_id: ID of the broken-down vehicle
        
        Returns:
            Dict with updated routes and actions taken
        """
        if not self.current_routes:
            return {'error': 'No routes available'}
        
        # Find the broken-down vehicle's route
        broken_route = None
        broken_route_idx = None
        
        for idx, route in enumerate(self.current_routes['routes']):
            if route['vehicle_id'] == vehicle_id:
                broken_route = route
                broken_route_idx = idx
                break
        
        if not broken_route:
            return {'error': f'Vehicle {vehicle_id} not found'}
        
        stops_to_redistribute = broken_route.get('stops', [])
        
        if not stops_to_redistribute:
            return {'action': 'NO_STOPS', 'message': 'Vehicle had no stops'}
        
        # Try to redistribute stops to other vehicles
        redistributed = []
        unassigned = []
        
        for stop in stops_to_redistribute:
            # Find nearest vehicle with capacity
            best_vehicle = None
            min_distance = float('inf')
            
            for route in self.current_routes['routes']:
                if route['vehicle_id'] == vehicle_id:
                    continue
                
                # Check if vehicle has capacity
                if route.get('utilization_pct', 0) > 90:
                    continue
                
                # Calculate distance to this vehicle's last stop
                if route['stops']:
                    last_stop = route['stops'][-1]
                    last_loc = (last_stop['latitude'], last_stop['longitude'])
                    stop_loc = (stop['latitude'], stop['longitude'])
                    dist = calculate_distance(
                        last_loc[0], last_loc[1],
                        stop_loc[0], stop_loc[1]
                    )
                    
                    if dist < min_distance:
                        min_distance = dist
                        best_vehicle = route
            
            if best_vehicle:
                best_vehicle['stops'].append(stop)
                best_vehicle['total_bins'] = len(best_vehicle['stops'])
                best_vehicle['total_demand_kg'] += stop.get('capacity_used', 0)
                best_vehicle['total_distance_km'] += min_distance / 1000
                best_vehicle['utilization_pct'] = (
                    best_vehicle['total_demand_kg'] / best_vehicle['capacity_kg']
                ) * 100
                
                redistributed.append({
                    'bin_id': stop['bin_id'],
                    'new_vehicle': best_vehicle['vehicle_id'],
                    'distance_from_last_stop_km': min_distance / 1000
                })
            else:
                unassigned.append(stop['bin_id'])
        
        # Remove the broken-down route
        self.current_routes['routes'].pop(broken_route_idx)
        self.current_routes['total_routes'] -= 1
        
        return {
            'action': 'REDISTRIBUTED',
            'vehicle_id': vehicle_id,
            'redistributed_stops': redistributed,
            'unassigned_stops': unassigned,
            'remaining_routes': len(self.current_routes['routes']),
            'timestamp': datetime.now().isoformat()
        }
    
    def update_routes_with_traffic(self, vehicle_id: str, delay_minutes: int, affected_stops: List[str]) -> Dict:
        """
        Update route timing when traffic delays are reported.
        
        Args:
            vehicle_id: ID of the affected vehicle
            delay_minutes: Additional delay in minutes
            affected_stops: List of bin IDs affected by the delay
        
        Returns:
            Dict with updated timing information
        """
        if not self.current_routes:
            return {'error': 'No routes available'}
        
        # Find the route
        target_route = None
        for route in self.current_routes['routes']:
            if route['vehicle_id'] == vehicle_id:
                target_route = route
                break
        
        if not target_route:
            return {'error': f'Vehicle {vehicle_id} not found'}
        
        # Update arrival times for affected stops
        updated_stops = []
        for stop in target_route.get('stops', []):
            if stop['bin_id'] in affected_stops:
                # Add delay to arrival time
                current_time = datetime.strptime(stop.get('estimated_arrival', '08:00'), '%H:%M')
                new_time = current_time + timedelta(minutes=delay_minutes)
                stop['estimated_arrival'] = new_time.strftime('%H:%M')
                stop['delayed_minutes'] = delay_minutes
                updated_stops.append(stop['bin_id'])
        
        return {
            'action': 'TRAFFIC_UPDATE',
            'vehicle_id': vehicle_id,
            'delay_minutes': delay_minutes,
            'updated_stops': updated_stops,
            'new_estimated_completion': self._estimate_completion_time(target_route),
            'timestamp': datetime.now().isoformat()
        }
    
    def _estimate_arrival_time(self, route: Dict, position: int) -> str:
        """Estimate arrival time for a stop at a given position."""
        base_time = datetime.strptime('08:00', '%H:%M')
        time_per_stop = 20  # minutes
        
        arrival = base_time + timedelta(minutes=position * time_per_stop)
        return arrival.strftime('%H:%M')
    
    def _estimate_completion_time(self, route: Dict) -> str:
        """Estimate completion time for a route."""
        stops = route.get('stops', [])
        if not stops:
            return 'N/A'
        
        base_time = datetime.strptime('08:00', '%H:%M')
        total_minutes = len(stops) * 20
        completion = base_time + timedelta(minutes=total_minutes)
        return completion.strftime('%H:%M')
    
    def _estimate_waste_kg(self, bin_row: Optional[pd.Series]) -> float:
        """Estimate waste in kg for a bin."""
        if bin_row is None:
            return 50  # Default estimate
        
        capacity = bin_row.get('bin_capacity_liters', 500)
        fill_pct = bin_row.get('avg_fill_pct', 50) / 100
        return capacity * fill_pct * 0.5
    
    def get_current_status(self) -> Dict:
        """Get current status of all routes."""
        if not self.current_routes:
            return {'status': 'No routes'}
        
        routes_status = []
        for route in self.current_routes.get('routes', []):
            routes_status.append({
                'vehicle_id': route['vehicle_id'],
                'total_stops': route['total_bins'],
                'completed_stops': 0,  # Would track in real scenario
                'remaining_stops': route['total_bins'],
                'estimated_completion': self._estimate_completion_time(route),
                'utilization_pct': route.get('utilization_pct', 0),
                'risk_level': 'HIGH' if any(s.get('risk_level') == 'CRITICAL' for s in route.get('stops', [])) else 'LOW'
            })
        
        return {
            'timestamp': datetime.now().isoformat(),
            'total_vehicles': self.current_routes.get('total_routes', 0),
            'routes': routes_status
        }
    
    def export_updated_routes(self, filename: str = 'updated_routes.json'):
        """Export updated routes to JSON."""
        if not self.current_routes:
            return
        
        with open(filename, 'w') as f:
            json.dump(self.current_routes, f, indent=2, default=str)
        
        print(f"✅ Exported updated routes to {filename}")
        return self.current_routes
