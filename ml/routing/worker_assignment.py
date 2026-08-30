"""
worker_assignment.py - Simplified Phase 4: Worker Assignment
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Optional
from datetime import datetime
import json
import warnings
warnings.filterwarnings('ignore')

# ─── Constants ──────────────────────────────────────────────────────────────

DEFAULT_WORKERS = [
    {'worker_id': 'W1', 'name': 'Rajesh Kumar', 'experience_years': 8, 
     'skill_level': 'expert', 'available': True},
    {'worker_id': 'W2', 'name': 'Priya Sharma', 'experience_years': 5, 
     'skill_level': 'advanced', 'available': True},
    {'worker_id': 'W3', 'name': 'Amit Patel', 'experience_years': 3, 
     'skill_level': 'intermediate', 'available': True},
    {'worker_id': 'W4', 'name': 'Sunita Reddy', 'experience_years': 10, 
     'skill_level': 'expert', 'available': True},
    {'worker_id': 'W5', 'name': 'Vikram Singh', 'experience_years': 2, 
     'skill_level': 'beginner', 'available': True},
    {'worker_id': 'W6', 'name': 'Ananya Iyer', 'experience_years': 6, 
     'skill_level': 'advanced', 'available': True},
    {'worker_id': 'W7', 'name': 'Deepak Nair', 'experience_years': 4, 
     'skill_level': 'intermediate', 'available': True},
    {'worker_id': 'W8', 'name': 'Meera Joshi', 'experience_years': 7, 
     'skill_level': 'advanced', 'available': True},
]

# ─── WorkerAssigner Class ──────────────────────────────────────────────────

class WorkerAssigner:
    def __init__(self, workers_df=None, routes_result=None, config=None):
        if workers_df is not None and not workers_df.empty:
            self.workers_df = workers_df
        else:
            self.workers_df = pd.DataFrame(DEFAULT_WORKERS)
        self.routes_result = routes_result or {'routes': []}
        self.config = config or {}
    
    def assign_workers(self):
        routes = self.routes_result.get('routes', [])
        available_workers = self.workers_df[self.workers_df['available'] == True].to_dict('records')
        
        if not routes:
            return {
                'assignments': [],
                'unassigned_routes': [],
                'summary': {
                    'total_assigned': 0,
                    'total_routes': 0,
                    'message': 'No routes to assign'
                },
                'timestamp': datetime.now().isoformat()
            }
        
        assignments = []
        assigned_workers = set()
        
        for route in routes:
            if len(route.get('stops', [])) == 0:
                continue
                
            # Find best worker
            best_worker = None
            best_score = -1
            
            for worker in available_workers:
                if worker['worker_id'] in assigned_workers:
                    continue
                
                score = 50  # Base score
                score += worker.get('experience_years', 0) * 5
                score += 10 if worker['skill_level'] in ['expert', 'advanced'] else 0
                
                if score > best_score:
                    best_score = score
                    best_worker = worker
            
            if best_worker:
                assignment = {
                    'worker_id': best_worker['worker_id'],
                    'worker_name': best_worker['name'],
                    'route_vehicle_id': route['vehicle_id'],
                    'match_score': round(best_score, 1),
                    'estimated_hours': round(len(route.get('stops', [])) * 0.25, 1),
                    'shift_start': '08:00',
                    'total_stops': len(route.get('stops', [])),
                    'total_distance_km': route.get('total_distance_km', 0),
                    'worker_skill': best_worker['skill_level'],
                    'experience_years': best_worker.get('experience_years', 0)
                }
                assignments.append(assignment)
                assigned_workers.add(best_worker['worker_id'])
        
        return {
            'assignments': assignments,
            'unassigned_routes': [],
            'summary': {
                'total_assigned': len(assignments),
                'total_routes': len([r for r in routes if r.get('stops')]),
                'avg_match_score': np.mean([a['match_score'] for a in assignments]) if assignments else 0,
                'total_hours': sum(a['estimated_hours'] for a in assignments),
                'skill_distribution': self._get_skill_distribution(assignments),
            },
            'timestamp': datetime.now().isoformat()
        }
    
    def _get_skill_distribution(self, assignments):
        skills = {}
        for a in assignments:
            skill = a.get('worker_skill', 'unknown')
            skills[skill] = skills.get(skill, 0) + 1
        return skills
    
    def create_shift_schedule(self, assignments_result):
        if not assignments_result or not assignments_result.get('assignments'):
            return pd.DataFrame()
        
        schedule = []
        for a in assignments_result['assignments']:
            schedule.append({
                'Worker ID': a['worker_id'],
                'Worker Name': a['worker_name'],
                'Vehicle': a['route_vehicle_id'],
                'Shift Start': a.get('shift_start', '08:00'),
                'Est. Hours': a['estimated_hours'],
                'Stops': a['total_stops'],
                'Distance (km)': a['total_distance_km'],
                'Match Score': a['match_score']
            })
        return pd.DataFrame(schedule)
    
    def export_assignments(self, assignments_result, filename='worker_assignments.json'):
        with open(filename, 'w') as f:
            json.dump(assignments_result, f, indent=2, default=str)
        print(f"✅ Exported worker assignments to {filename}")
        return assignments_result

