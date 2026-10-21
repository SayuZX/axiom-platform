# frozen_string_literal: true
ENV['BUNDLE_GEMFILE'] ||= File.expand_path('../apps/payment-core/Gemfile',__dir__)
require 'bundler/setup'
require 'sqlite3'
source, destination = ARGV
abort 'Usage: ruby operations/backup.rb ABSOLUTE_DATABASE ABSOLUTE_BACKUP' unless source && destination && File.file?(source) && !File.exist?(destination)
database = SQLite3::Database.new(source)
begin
  database.busy_timeout = 5000
  database.execute('VACUUM INTO ?', [File.expand_path(destination)])
  backup = SQLite3::Database.new(destination)
  begin
    raise 'Backup integrity check failed' unless backup.get_first_value('PRAGMA integrity_check') == 'ok'
  ensure
    backup.close
  end
  puts 'SQLite backup created and integrity verified; source unchanged.'
ensure
  database.close
end
