import json
import tempfile
import unittest
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from app import Store
from engine import new_state, validate

class CountdownPersistence(unittest.TestCase):
    def test_origin_is_saved_once_and_survives_scores_and_restart(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'state.json'
            store=Store(path)
            state=deepcopy(store.state)
            state['settings']['start_at']='2099-01-01T20:00:00Z'
            with patch('app.datetime') as clock:
                clock.now.return_value=datetime(2099,1,1,18,tzinfo=timezone.utc)
                store.save(state)
            origin=store.state['settings']['disaster_started_at']
            self.assertEqual(origin,'2099-01-01T18:00:00.000Z')
            changed=deepcopy(store.state)
            changed['round1']['players']['p1']['goals'][0]=1
            changed['settings']['disaster_started_at']='2090-01-01T00:00:00Z'
            store.save(changed)
            self.assertEqual(store.state['settings']['disaster_started_at'],origin)
            self.assertEqual(Store(path).state['settings']['disaster_started_at'],origin)

    def test_new_deadline_restarts_clear_resets_and_restore_keeps_origin(self):
        with tempfile.TemporaryDirectory() as folder:
            store=Store(Path(folder)/'state.json')
            first=deepcopy(store.state)
            first['settings'].update(start_at='2099-01-01T20:00:00Z',disaster_started_at='2099-01-01T18:00:00Z')
            store.save(first,restore=True)
            backup=deepcopy(store.state)
            changed=deepcopy(backup)
            changed['settings']['start_at']='2099-01-02T20:00:00Z'
            with patch('app.datetime') as clock:
                clock.now.return_value=datetime(2099,1,2,18,tzinfo=timezone.utc)
                store.save(changed)
            self.assertEqual(store.state['settings']['disaster_started_at'],'2099-01-02T18:00:00.000Z')
            changed=deepcopy(store.state);changed['settings']['start_at']=''
            store.save(changed)
            self.assertEqual(store.state['settings']['disaster_started_at'],'')
            store.save(backup,restore=True)
            self.assertEqual(store.state['settings'],backup['settings'])

    def test_existing_countdown_gets_one_persisted_origin_on_upgrade(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'state.json'
            state=new_state();state['settings']['start_at']='2099-01-01T20:00:00Z'
            del state['settings']['disaster_started_at']
            path.write_text(json.dumps(state))
            store=Store(path);origin=store.state['settings']['disaster_started_at']
            self.assertTrue(origin)
            self.assertEqual(Store(path).state['settings']['disaster_started_at'],origin)

    def test_timestamp_validation_and_timezone_normalization(self):
        state=new_state();state['settings']['start_at']='2099-01-01T14:00:00-06:00'
        self.assertEqual(validate(state)['settings']['start_at'],'2099-01-01T20:00:00.000Z')
        for key in ['start_at','disaster_started_at']:
            for invalid in [True,{},'bad date','2099-99-42T25:99:00Z']:
                state=new_state();state['settings'][key]=invalid
                with self.subTest(key=key,invalid=invalid),self.assertRaises(ValueError):validate(state)

if __name__=='__main__':unittest.main()
