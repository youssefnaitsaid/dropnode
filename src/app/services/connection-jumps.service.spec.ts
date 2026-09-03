import { TestBed } from '@angular/core/testing';
import { ConnectionJumpsService, CONNECTION_JUMPS_ENABLED_STORAGE_KEY } from './connection-jumps.service';

describe('ConnectionJumpsService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function setup() {
    TestBed.configureTestingModule({});
    return TestBed.inject(ConnectionJumpsService);
  }

  it('is off by default and stores nothing until toggled', () => {
    const service = setup();
    expect(service.enabled()).toBe(false);
    expect(localStorage.getItem(CONNECTION_JUMPS_ENABLED_STORAGE_KEY)).toBeNull();
  });

  it('toggles on and persists across instances', () => {
    const service = setup();
    service.toggle();
    expect(service.enabled()).toBe(true);

    TestBed.resetTestingModule();
    expect(setup().enabled()).toBe(true);
  });

  it('reads a malformed stored value as off', () => {
    localStorage.setItem(CONNECTION_JUMPS_ENABLED_STORAGE_KEY, 'yes');
    expect(setup().enabled()).toBe(false);
  });
});
