# frozen_string_literal: true
require 'date'
require_relative '../../infrastructure/persistence/operations_store'

module Axiom
  class Reports
    def initialize(db)
      @store = OperationsStore.new(db)
    end

    def read(customer_id, period, date=nil, include_rows:false)
      raise Error.new(400, 'Periode harus daily atau monthly.') unless %w[daily monthly].include?(period)
      now = Time.now.getlocal('+07:00')
      selected = date ? Date.iso8601(date) : Date.new(now.year, now.month, now.day)
      start = period == 'monthly' ? Date.new(selected.year, selected.month, 1) : selected
      finish = period == 'monthly' ? start.next_month : start + 1
      from = Time.new(start.year, start.month, start.day, 0, 0, 0, '+07:00').to_i * 1000
      to = Time.new(finish.year, finish.month, finish.day, 0, 0, 0, '+07:00').to_i * 1000
      result = { date:start.to_s, period:period, totals:@store.report_totals(customer_id, from, to) }
      result[:rows] = @store.report_rows(customer_id, from, to) if include_rows
      result
    rescue Date::Error, TypeError
      raise Error.new(400, 'Tanggal laporan tidak valid.')
    end
  end
end
