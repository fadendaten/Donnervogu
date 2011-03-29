include EmailaccountHelper
class Emailaccount < ActiveRecord::Base
	validates_presence_of :email
	validates_presence_of :name
	serialize :preferences
	
	
  def initialize panda={}
	  super panda
    self.preferences = Hash.new
    self.loadInitPreferences
    self.last_get = Time.now
	end

  def self.oldestGet
	  self.minimum("last_get")
  end
	
	def setParams params
	  raise "No Params" if params.nil?
	  params.each do |key, value|
	    raise "key nil" if key.nil?
	    raise "value nil" if value.nil?
	     self.preferences[key.to_sym] = value if validKey?(key)
	  end 
    self.save
    FileCreator::createNewZip(self)
    assureCreatedZip
  end
  
	def validKey? key
	    (not key.nil?) and (FileCreator::validKey?(key.to_sym))
	end
	
	def assureCreatedZip
	    FileCreator::createNewZip(self)
	    raise "No file created" unless File.exists? zipPath
	end

	def assureZipPath
		assureCreatedZip
		zipPath
	end
	
	def zipPath
		FileCreator::completeZipPath self
	end
	
	#DR we have to load group or template stuff here from a file or what ever
	def loadInitPreferences
	  self.preferences[:signature] = "This is just a template signature"
	end
	
	def downloaded
		self.last_get = Time.now
	end
end
